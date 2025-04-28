//C:\Users\rivid\OneDrive\Desktop\IIT\Final Year Project\EMS CODING\EMPLOYEE SYSTEM V1\Employee MS\Server\Routes\AuthRoute.js

import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET_KEY;

router.post("/employeelogin", async (req, res) => {
  const { email, password } = req.body;

  try {
    const employee = await prisma.teamMember.findUnique({ where: { email } });

    if (!employee) {
      return res.status(404).json({ error: "The entered credentials are not in the system. Please contact your administrator." });
    }

    const now = new Date();

    // ✅ Reset failed attempts if the lock period is over
    if (employee.failedAttempts >= 3 && employee.lockUntil && new Date(employee.lockUntil) <= now) {
      await prisma.teamMember.update({
        where: { email },
        data: { failedAttempts: 0, lockUntil: null }
      });
      employee.failedAttempts = 0; // ✅ Reset failedAttempts in memory
    }

    const isMatch = await bcrypt.compare(password, employee.password);

    if (!isMatch) {
      const updatedEmployee = await prisma.teamMember.update({
        where: { email },
        data: { failedAttempts: Number(employee.failedAttempts) + 1 } // FIX: Convert BigInt to Number
      });

      // ✅ Lock the user only if they exceed 3 attempts AFTER the reset
      if (updatedEmployee.failedAttempts >= 3) {
        const lockUntil = new Date(now.getTime() + 60 * 1000); // Lock for 1 min
        await prisma.teamMember.update({
          where: { email },
          data: { lockUntil }
        });

        return res.status(403).json({ error: "Too many failed attempts. You are locked from the system for 1 minute." });
      }

      return res.status(401).json({ error: "Incorrect password. Please try again." });
    }

    // ✅ Reset failed attempts on successful login
    await prisma.teamMember.update({
      where: { email },
      data: { failedAttempts: 0, lockUntil: null }
    });

    // ✅ Generate JWT Token (30-day expiration)
    const token = jwt.sign(
      { id: employee.id, role: employee.role },
      JWT_SECRET,
      { expiresIn: "30d" } // ✅ Expires in 30 days
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // ✅ Only secure cookies in production
      sameSite: "Lax",  // ✅ Allow token usage across the site
      maxAge: 30 * 24 * 60 * 60 * 1000, // ✅ 30 days expiration
    });

    res.status(200).json({ loginStatus: true, role: employee.role, token });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

//  Logout Route
router.post("/logout", async (req, res) => {
  try {
    res.clearCookie("token");
    res.status(200).json({ message: "Logged out successfully!" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

//  Check if user session is still active
router.get("/check-session", (req, res) => {
  try {
    if (!req.cookies.token) {
      return res.json({ isAuthenticated: false });
    }

    //  Decode token to verify session
    const decoded = jwt.verify(req.cookies.token, JWT_SECRET);
    return res.json({ isAuthenticated: true, user: decoded });

  } catch (error) {
    return res.json({ isAuthenticated: false });
  }
});


export { router as authRouter };
