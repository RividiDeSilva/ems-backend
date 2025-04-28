// C:\Users\rivid\OneDrive\Desktop\IIT\Final Year Project\EMS CODING\EMPLOYEE SYSTEM V1\Employee MS\Server\Routes\TaskRoute.js
import express from "express";
import prisma from "../utils/db.js";
import { authorize } from "../utils/authorize.js";

const TaskRouter = express.Router();

/**
 * CREATE Tasks (Managers Only)
 * - Expects: { description, assignedToArray, dueDate, frequency, priority }
 * - Creates multiple tasks (one per assignedTo)
 */
TaskRouter.post("/tasks", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    const { description, assignedToArray, dueDate, frequency, priority } = req.body;

    if (!assignedToArray || !Array.isArray(assignedToArray) || assignedToArray.length === 0) {
      return res.status(400).json({ error: "No team members selected" });
    }

    const createdTasks = [];

    for (const assignedTo of assignedToArray) {
     const defaultDue = (() => {
              const d = new Date();
              // if user didn’t pick a time, but did pick a frequency → end of today
              if (!dueDate && frequency) d.setHours(23, 59, 59, 999);
              return d;
            })();
      const newTask = await prisma.task.create({
        data: {
          description,
          assignedById: req.user.id,
          assignedToId: assignedTo,

           // if user picked a date → use it;
                    // otherwise if they picked a frequency → end of today;
                    // else → null
                    dueDate: dueDate
                      ? new Date(dueDate)
                      : frequency
                        ? (() => {
                            const d = new Date();
                           d.setHours(23, 59, 59, 999);
                            return d;
                          })()
                        : null,

          frequency: frequency || null,
          priority: priority || "Normal",
          completed: false,
          status: "In Progress",
        },
      });

      // Socket.io broadcast
      const io = req.app.get("socketio");
      io.emit("new-task", newTask);

      // Create notification for the assigned employee
      await prisma.notification.create({
        data: {
          message: `New Task Assigned: ${description}`,
          userID: assignedTo,  // Employee receiving notification
          managerID: req.user.id,  // Manager who created task
          read: false,
        },
      });

      createdTasks.push(newTask);
    }

    return res.status(201).json(createdTasks);
  } catch (err) {
    console.error("❌ Error creating task:", err);
    return res.status(500).json({ error: "Error creating task" });
  }
});

/**
 * UPDATE Task Status (Managers Only)
 * - Body: { status: "In Progress" | "Cancelled" | "Completed" | "Late" }
 */
TaskRouter.put("/tasks/:taskId/status", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;

    const isCompleted = status === "Completed";

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        completed: isCompleted,
      },
    });

    // Socket.io broadcast
    const io = req.app.get("socketio");
    io.emit("task-updated", updatedTask);

    // If marking as "Late", create a notification
    if (status === "Late") {
      await prisma.notification.create({
        data: {
          message: `Task '${updatedTask.description}' is now LATE!`,
          userID: updatedTask.assignedToId,
        },
      });
    }

    return res.json(updatedTask);
  } catch (err) {
    console.error("❌ Error updating task status:", err);
    return res.status(500).json({ error: "Error updating task status" });
  }
});

/**
 * DELETE Task (Managers Only)
 * - Allows manager to delete a task entirely
 */
TaskRouter.delete("/tasks/:taskId", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    const { taskId } = req.params;

    // Delete the task
    const deletedTask = await prisma.task.delete({
      where: { id: taskId },
    });

    // Broadcast a "task-deleted" event
    const io = req.app.get("socketio");
    io.emit("task-deleted", { id: taskId });

    return res.json(deletedTask);
  } catch (err) {
    console.error("❌ Error deleting task:", err);
    return res.status(500).json({ error: "Error deleting task" });
  }
});

/**
 * GET All Tasks (Managers Only)
 * - Fetch tasks created by the currently logged-in manager
 */
TaskRouter.get("/tasks", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    const startOfToday = new Date();
       startOfToday.setHours(0,0,0,0);
        await prisma.task.updateMany({
          where: {
            status: "In Progress",
            dueDate: { not: null, lt: startOfToday }
          },
          data: { status: "Late", completed: false }
        });
    const tasks = await prisma.task.findMany({
      where: { assignedById: req.user.id },
    });
    return res.json(tasks);
  } catch (err) {
    console.error("❌ Error fetching tasks:", err);
    return res.status(500).json({ error: "Error fetching tasks" });
  }
});

/**
 * GET Tasks Assigned to the Logged-in Employee (Sales Assistant)
 */
TaskRouter.get("/tasks/assigned", authorize(["Sales Assistant"]), async (req, res) => {
  try {
     // mark anything due < start of today as late
     const startOfToday = new Date();
     startOfToday.setHours(0,0,0,0);
     await prisma.task.updateMany({
       where: {
         status: "In Progress",
         dueDate: { not: null, lt: startOfToday }
       },
       data: { status: "Late", completed: false }
     });
    const tasks = await prisma.task.findMany({
      where: { assignedToId: req.user.id },
    });
    return res.json(tasks);
  } catch (err) {
    console.error("❌ Error fetching assigned tasks:", err);
    return res.status(500).json({ error: "Error fetching assigned tasks" });
  }
});

/**
 * GET Team Members Managed by a Manager
 */
TaskRouter.get("/team-members", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    const teamMembers = await prisma.teamMember.findMany({
      where: { managerID: req.user.id },
      select: { id: true, fullName: true, email: true },
    });
    return res.json(teamMembers);
  } catch (error) {
    console.error("❌ Error fetching team members:", error);
    return res.status(500).json({ error: "Error fetching team members" });
  }
});

export default TaskRouter;
