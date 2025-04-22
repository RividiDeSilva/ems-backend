
import express from "express";
import { PrismaClient } from "@prisma/client";
import { authorize } from "../utils/authorize.js";

const prisma = new PrismaClient();
const leaveRouter = express.Router();

leaveRouter.post(
  "/",
  authorize(["Sales Assistant", "Showroom Assistant Manager", "Showroom Manager"]),
  async (req, res) => {
    try {
      const { startDate, endDate, reason, typeOfLeave } = req.body;

      // (A) Validate presence
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate required." });
      }

      // Block past dates
      const now = new Date();
      const sDate = new Date(startDate);
      if (sDate.setHours(0, 0, 0, 0) < now.setHours(0, 0, 0, 0)) {
        return res.status(400).json({ error: "Cannot request leave for a past date." });
      }

      // (B) reason length
      if (reason && reason.length > 300) {
        return res.status(400).json({ error: "Reason cannot exceed 300 characters." });
      }

      // (C) If half day => endDate = startDate
      let finalEndDate = new Date(endDate);
      if (typeOfLeave === "Half Day") {
        finalEndDate = new Date(startDate);
      }

      // (D) Find employee
      const employee = await prisma.teamMember.findUnique({
        where: { id: req.user.id },
      });
      if (!employee) {
        return res.status(404).json({ error: "Employee record not found." });
      }

      // (E) Compute dayCount
      let dayCount = 1;
      if (typeOfLeave === "Half Day") {
        dayCount = 0.5;
      } else {
        const eDate = new Date(finalEndDate);
        const sDate2 = new Date(startDate);
        dayCount = Math.floor((eDate - sDate2) / (1000 * 60 * 60 * 24)) + 1;
        if (dayCount < 1) {
          return res.status(400).json({ error: "Invalid date range (end < start)." });
        }
      }

      // (F) Over-limit check
      let overLimit = false;
      if (employee.monthlyLeavesUsed + dayCount > 4) {
        overLimit = true;
      }

      // (G) Create the leave
      const newLeave = await prisma.leave.create({
        data: {
          userID: req.user.id,
          startDate: new Date(startDate),
          endDate: finalEndDate,
          reason,
          typeOfLeave,
          status: "Pending",
          exceedCheckStatus: overLimit, // if over-limit => true
        },
      });

      // (H) Notify manager
      if (employee.managerID) {
        await prisma.notification.create({
          data: {
            message: `New Leave Request from ${employee.fullName || "Employee"}: ${reason}`,
            userID: employee.managerID,
            managerID: employee.managerID,
            read: false,
          },
        });
      }

      // (I) Socket broadcast
      const io = req.app.get("socketio");
      io.emit("leave-created", newLeave);

      // (J) Return
      return res.status(201).json({
        ...newLeave,
        overLimit,
      });
    } catch (error) {
      console.error("Error creating leave request:", error);
      return res.status(500).json({ error: "Database error" });
    }
  }
);

leaveRouter.patch("/:leaveId/approve", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    console.log("Approving leave...");
    const { leaveId } = req.params;
    const { managerComments } = req.body;

    const leaveReq = await prisma.leave.findUnique({ where: { id: leaveId } });
    if (!leaveReq) {
      return res.status(404).json({ error: "Leave not found" });
    }

    // compute dayCount
    let dayCount = 1;
    const start = new Date(leaveReq.startDate);
    const end = new Date(leaveReq.endDate);
    if (leaveReq.typeOfLeave === "Half Day") {
      dayCount = 0.5;
    } else {
      dayCount = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
      if (dayCount < 1) {
        return res.status(400).json({ error: "Invalid date range." });
      }
    }

    // Approve => status=Approved
    const updatedLeave = await prisma.leave.update({
      where: { id: leaveId },
      data: {
        status: "Approved",
        managerComments: managerComments || null,
      },
    });

    // increment usage in TeamMember
     // store the returned object in updatedEmployee so we can log it
        const updatedEmployee = await prisma.teamMember.update({
          where: { id: leaveReq.userID },
          data: {
            monthlyLeavesUsed: { increment: dayCount },
            totalLeavesUsed: { increment: dayCount },
          },
        });

        // 🔴 Add your console.log here:
        console.log(
          "✅ monthlyLeavesUsed & totalLeavesUsed updated for user:",
          updatedEmployee.id,
          "| monthlyLeavesUsed:",
          updatedEmployee.monthlyLeavesUsed,
          "| totalLeavesUsed:",
          updatedEmployee.totalLeavesUsed
        );

    // notify employee
    await prisma.notification.create({
      data: {
        message: `Your leave request from ${start.toDateString()} to ${end.toDateString()} is Approved.`,
        userID: leaveReq.userID,
      },
    });

    // broadcast
    const io = req.app.get("socketio");
    io.emit("leave-updated", updatedLeave);

    return res.json(updatedLeave);
  } catch (error) {
    console.error("Error approving leave:", error);
    return res.status(500).json({ error: "Database error" });
  }
});


leaveRouter.patch("/:leaveId/reject", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    const { leaveId } = req.params;
    const { managerComments } = req.body;

    const leaveReq = await prisma.leave.findUnique({ where: { id: leaveId } });
    if (!leaveReq) {
      return res.status(404).json({ error: "Leave not found" });
    }

    const updated = await prisma.leave.update({
      where: { id: leaveId },
      data: {
        status: "Rejected",
        managerComments: managerComments || null,
      },
    });

    // notify employee
    await prisma.notification.create({
      data: {
        message: `Your leave request from ${leaveReq.startDate} to ${leaveReq.endDate} is Rejected.`,
        userID: leaveReq.userID,
      },
    });

    // broadcast
    const io = req.app.get("socketio");
    io.emit("leave-updated", updated);

    return res.json(updated);
  } catch (error) {
    console.error("Error rejecting leave:", error);
    return res.status(500).json({ error: "Database error" });
  }
});

/**
 * DELETE a pending leave
 */
leaveRouter.delete(
  "/:leaveId",
  authorize(["Sales Assistant", "Showroom Assistant Manager", "Showroom Manager"]),
  async (req, res) => {
    try {
      const { leaveId } = req.params;
      const leaveReq = await prisma.leave.findUnique({ where: { id: leaveId } });
      if (!leaveReq) {
        return res.status(404).json({ error: "Leave not found" });
      }

      // must be pending + belong to user
      if (leaveReq.userID !== req.user.id) {
        return res.status(403).json({ error: "Not your leave request." });
      }
      if (leaveReq.status !== "Pending") {
        return res.status(400).json({ error: "Cannot delete a non-pending leave." });
      }

      await prisma.leave.delete({ where: { id: leaveId } });

      const io = req.app.get("socketio");
      io.emit("leave-deleted", { id: leaveId });

      return res.json({ message: "Leave deleted." });
    } catch (error) {
      console.error("Error deleting leave:", error);
      return res.status(500).json({ error: "Database error" });
    }
  }
);

/**
 * GET /api/leaves/my-leaves
 */
leaveRouter.get(
  "/my-leaves",
  authorize(["Sales Assistant", "Showroom Assistant Manager", "Showroom Manager"]),
  async (req, res) => {
    try {
      const userID = req.user.id;
      const myLeaves = await prisma.leave.findMany({
        where: { userID },
        orderBy: { createdAt: "desc" },
      });
      res.json(myLeaves);
    } catch (error) {
      console.error("Error fetching user leaves:", error);
      res.status(500).json({ error: "Database error" });
    }
  }
);

/**
 * Manager sees all leaves
 * GET /api/leaves
 */
leaveRouter.get("/", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    const leaves = await prisma.leave.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(leaves);
  } catch (error) {
    console.error("Error fetching leaves:", error);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * GET /api/leaves/usage
 * Manager sees usage by month
 */
leaveRouter.get("/usage", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    const { employeeId } = req.query;

    let whereClause = { status: "Approved" };
    if (employeeId) {
      whereClause.userID = employeeId;
    }

    const approvedLeaves = await prisma.leave.findMany({
      where: whereClause,
      orderBy: { startDate: "asc" },
    });

    const usageMap = {};
    approvedLeaves.forEach((lv) => {
      const s = new Date(lv.startDate);
      const e = new Date(lv.endDate);

      let dayCount = 1;
      if (lv.typeOfLeave === "Half Day") {
        dayCount = 0.5;
      } else {
        dayCount = Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;
      }

      const year = s.getFullYear();
      const month = s.getMonth() + 1;
      const key = `${year}-${month}`;
      if (!usageMap[key]) usageMap[key] = 0;
      usageMap[key] += dayCount;
    });

    const usageArray = Object.entries(usageMap).map(([monthKey, daysUsed]) => ({
      monthKey,
      daysUsed,
    }));

    res.json(usageArray);
  } catch (error) {
    console.error("Error computing usage:", error);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * Manager "Mark as Checked" for exceeded leaves
 * PATCH /api/leaves/:leaveId/exceed-check
 */
leaveRouter.patch("/:leaveId/exceed-check", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    const { leaveId } = req.params;

    const leaveReq = await prisma.leave.findUnique({ where: { id: leaveId } });
    if (!leaveReq) {
      return res.status(404).json({ error: "Leave not found" });
    }
    if (!leaveReq.exceedCheckStatus) {
      return res.status(400).json({ error: "This leave is not flagged as exceeded." });
    }

    const updated = await prisma.leave.update({
      where: { id: leaveId },
      data: {
        exceedCheckedByManager: true,
      },
    });

    // Optionally notify the employee
    await prisma.notification.create({
      data: {
        message: `Manager reviewed your exceeded leave from ${leaveReq.startDate} to ${leaveReq.endDate}.`,
        userID: leaveReq.userID,
      },
    });

    const io = req.app.get("socketio");
    io.emit("leave-updated", updated);

    res.json(updated);
  } catch (error) {
    console.error("Error marking exceed-check:", error);
    return res.status(500).json({ error: "Database error" });
  }
});

export { leaveRouter };
