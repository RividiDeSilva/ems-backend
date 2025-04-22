//C:\Users\rivid\OneDrive\Desktop\IIT\Final Year Project\EMS CODING\EMPLOYEE SYSTEM V1\Employee MS\Server\utils\roleMiddleware.js

import jwt from "jsonwebtoken";

// Middleware to authenticate and authorize users based on roles
export const authorize = (roles = []) => {
  return (req, res, next) => {
    const token = req.cookies.token; // Check if token exists in cookies
    if (!token) {
      return res.status(401).json({ message: "Unauthorized - No token provided" });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

      // Check if the user's role is allowed to access this route
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: "Forbidden - Access Denied" });
      }

      req.user = decoded; // Attach the decoded user data to the request object
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: "Unauthorized - Token expired" });
      }
      return res.status(401).json({ message: "Unauthorized - Invalid token" });
    }
  };
};
