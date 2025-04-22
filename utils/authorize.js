//C:\Users\rivid\OneDrive\Desktop\IIT\Final Year Project\EMS CODING\EMPLOYEE SYSTEM V1\Employee MS\Server\utils\authorize.js

import jwt from "jsonwebtoken";
import axios from "axios";
import Cookies from "js-cookie";

// ✅ Function to check if user session is valid
export const checkSession = async () => {
    const token = Cookies.get("token");

    if (!token) {
        console.warn("❌ No token found! Redirecting to login...");
        return false;
    }

    try {
        const response = await axios.get("http://localhost:3000/auth/check-session", {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true
        });

        return response.data.isAuthenticated;
    } catch (error) {
        console.error("❌ Session Check Failed:", error);
        return false;
    }
};

// Middleware to authenticate and authorize users based on roles
export const authorize = (roles = []) => {
  return (req, res, next) => {
    console.log("🔹 Checking Authorization for:", req.user);


    const token = req.cookies.token;  // or fallback to req.headers.authorization
    if (!token) return res.status(401).json({ message: "Unauthorized" });


    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: "Forbidden - Access Denied" });
      }

      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ message: err.name === "TokenExpiredError" ? "Unauthorized - Token expired" : "Unauthorized - Invalid token" });
    }
  };
};

