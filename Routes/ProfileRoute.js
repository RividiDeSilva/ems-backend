
import express from "express";
import { PrismaClient } from "@prisma/client";
import { authorize } from "../utils/authorize.js";

const prisma = new PrismaClient();
const profileRouter = express.Router();

/** Converts any BigInt fields to normal numbers */
function convertBigInts(obj) {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );
}

profileRouter.get("/profile", authorize(), async (req, res) => {
  try {
    const userID = req.user.id;
    console.log("🔹 [ProfileRoute] userID from token:", userID);

    const profile = await prisma.teamMember.findUnique({
      where: { id: userID },
    });
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const sanitizedProfile = convertBigInts(profile);
    console.log("✅ [ProfileRoute] Fetched user from DB (sanitized):", sanitizedProfile);

    res.json({ user: sanitizedProfile });
  } catch (error) {
    console.error("❌ Error fetching profile:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default profileRouter;
