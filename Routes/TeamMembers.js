// Server/Routes/TeamMembers.js
import express from "express";
import prisma from "../utils/db.js";
import { authorize } from "../utils/authorize.js";

const teamMembersRouter = express.Router();

teamMembersRouter.get(
  "/",
  authorize(["Showroom Manager"]), // Must match EXACT role in DB
  async (req, res) => {
    try {
      const managerID = req.user.id;
      console.log("[teamMembersRouter] managerID from JWT:", managerID);

      // 1) Return whichever fields you need from each TeamMember
      //    Make sure you close the object with } before the );
      const subordinates = await prisma.teamMember.findMany({
        where: { managerID },
        select: {
          id: true,
          fullName: true,
          salesPersonCode: true,
          email: true,
          dateOfBirth: true,
          gender: true,
          contactAddress: true,

        },
      });

      console.log("[teamMembersRouter] subordinates found:", subordinates);

      if (!subordinates || subordinates.length === 0) {
        console.warn("[teamMembersRouter] No subordinates found for manager:", managerID);
        return res
          .status(404)
          .json({ message: "No team members found for this manager." });
      }

      console.log("[teamMembersRouter] Returning subordinates to client...");
      return res.json(subordinates);
    } catch (err) {
      console.error("[teamMembersRouter] Error fetching team members:", err);
      return res.status(500).json({ error: "Database error" });
    }
  }
);

export { teamMembersRouter };
