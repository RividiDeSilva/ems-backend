//C:\Users\rivid\OneDrive\Desktop\IIT\Final Year Project\EMS CODING\EMPLOYEE SYSTEM V1\Employee MS\Server\index.js

import express from "express";
import helmet from "helmet";
import http from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { authRouter } from "./Routes/AuthRoute.js";
import profileRouter from "./Routes/ProfileRoute.js";
import { authorize } from "./utils/authorize.js";
import prisma from "./utils/db.js";        // Prisma client
import TaskRouter from "./Routes/TaskRoute.js";
import cron from "node-cron";             // node-cron for scheduling tasks
import { Server } from "socket.io";
import notificationRouter from "./Routes/NotificationsRoute.js";
import { leaveRouter } from "./Routes/LeaveRoute.js";
import { teamMembersRouter } from "./Routes/TeamMembers.js";
import { kpiRouter } from "./Routes/KpiRoute.js";
import { salesAnalysisRouter } from "./Routes/SalesAnalysis.js";



dotenv.config();
const app = express();

/* ---------------------- 1) CORS CONFIG ---------------------- */
app.use(cors({
  origin: "http://localhost:5173",  // Your frontend origin
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true,                // Allow cookies to be sent
  allowedHeaders: ["Content-Type", "Authorization"],
}));

try {
  await prisma.$connect();
  console.log("✅ Verified DB connection in index.js");
} catch (err) {
  console.error("❌ DB connection error in index.js:", err);
}
/* ---------------------- 2) TEST DB CONNECTION ---------------------- */
async function testDBConnection() {
  try {
    await prisma.$connect();
    console.log("Connected to MongoDB via Prisma");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
  }
}
testDBConnection();

/* ---------------------- 3) MIDDLEWARE ---------------------- */
app.use(express.json());
app.use(helmet());        // Security headers
app.use(cookieParser());  // Parse cookies


/* ---------------------- 4) ROUTES ---------------------- */
app.use("/auth", authRouter);
app.use("/api/employee", profileRouter);
app.use("/api", TaskRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/leaves", leaveRouter);
app.use("/api/team-members", teamMembersRouter);
app.use("/api/kpis", kpiRouter);
app.use("/api/sales", salesAnalysisRouter);

// Protected route example (optional)
app.get("/protected", authorize(), (req, res) => {
  res.json({ message: `Hello ${req.user.role}, you have access!` });
});

// Re-apply cookieParser if needed
app.use(cookieParser());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

/* ---------------------- 5) CREATE HTTP & SOCKET.IO SERVER ---------------------- */
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true, // Let websockets send cookies too
  },
});
app.set("socketio", io);

// Socket.IO events
io.on("connection", (socket) => {
  console.log("✅ WebSocket connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("❌ WebSocket disconnected:", socket.id);
  });
});

/* ------------------------------------------------------------------
   6) CRON JOB: Overdue & Repeating Tasks
   Runs every day at midnight (00:00).
------------------------------------------------------------------ */
cron.schedule("0 0 * * *", async () => {
  try {
    console.log("Running overdue & repeating check via node-cron...");

    /* -------------- (A) Mark Overdue Tasks as 'Late' -------------- */
    const overdueTasks = await prisma.task.findMany({
      where: {
        dueDate: { lt: new Date() },
        status: { notIn: ["Completed", "Cancelled", "Late"] },
      },
    });

    for (const task of overdueTasks) {
      // 1) Update status to 'Late'
      const updated = await prisma.task.update({
        where: { id: task.id },
        data: { status: "Late" },
      });

      // 2) Create a notification about being overdue
      await prisma.notification.create({
        data: {
          message: `Task '${task.description}' assigned to #${task.assignedToId} is now OVERDUE!`,
          userID: task.assignedToId, // The employee
          managerID: task.assignedById, // The manager
          read: false,
        },
      });

      // 3) Broadcast to front-end
      const io = app.get("socketio");
      io.emit("task-updated", updated);
    }

    /* -------------- (B) Create Next Occurrence for Repeating Tasks -------------- */
    // Only create a new occurrence if the task's due date is before today (i.e. it's due)
    const tasksNeedingNext = await prisma.task.findMany({
      where: {
        frequency: { in: ["Daily", "Weekly", "Monthly"] },
        dueDate: { lt: new Date(new Date().setHours(0, 0, 0, 0)) }
      },
    });

    for (const oldTask of tasksNeedingNext) {
      // Compute next due date based on current due date and frequency
      const nextDue = getNextDueDate(oldTask.dueDate, oldTask.frequency);

      // Append new due date label to description
      const dateLabel = nextDue.toLocaleDateString();
      const newDescription = `${oldTask.description} (${dateLabel})`;

      // Create the new task occurrence
      const newTask = await prisma.task.create({
        data: {
          description: newDescription,
          assignedById: oldTask.assignedById,
          assignedToId: oldTask.assignedToId,
          dueDate: nextDue,
          frequency: oldTask.frequency, // keep same frequency
          priority: oldTask.priority,
          completed: false,
          status: "In Progress",
        },
      });

      // Broadcast to front-end
      const io = app.get("socketio");
      io.emit("new-task", newTask);

      // Notification to manager about the new occurrence
      await prisma.notification.create({
        data: {
          message: `Repeating task '${oldTask.description}' has a new occurrence: '${newDescription}'.`,
          userID: oldTask.assignedById,
          managerID: oldTask.assignedById,
          read: false,
        },
      });

      console.log(`Created next occurrence from Task ${oldTask.id} -> ${newTask.id}`);
    }
  } catch (error) {
    console.error("❌ Error in overdue/repeating cron job:", error);
  }
});


/* ---------------------- Helper: getNextDueDate ---------------------- */
function getNextDueDate(currentDueDate, frequency) {
  if (!currentDueDate) {
    // If no dueDate, default to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  const date = new Date(currentDueDate);

  switch (frequency) {
    case "Daily":
      date.setDate(date.getDate() + 1);
      break;
    case "Weekly":
      date.setDate(date.getDate() + 7);
      break;
    case "Monthly":
      date.setMonth(date.getMonth() + 1);
      break;
    default:
      break;
  }
  return date;
}

cron.schedule("0 0 28 * *", async () => {
  try {
    console.log("🔔 Checking for missing KPI records (22nd day @4:00 PM)...");
    const allPairs = getAllYearMonthPairsUpToNow();
    const salesAssistants = await prisma.teamMember.findMany({
      where: { role: "Sales Assistant" },
    });

    for (const assistant of salesAssistants) {
      if (!assistant.salesPersonCode) continue;
      for (const pair of allPairs) {
        const foundKpi = await prisma.kPI.findUnique({
          where: {
            salesPersonCode_year_month: {
              salesPersonCode: assistant.salesPersonCode,
              year: pair.year,
              month: pair.month,
            },
          },
        });
        if (!foundKpi) {
          console.log(
            `Missing KPI for ${assistant.fullName} => ${pair.month}/${pair.year}`
          );
          const msg = `Reminder: Please complete KPI for ${assistant.fullName} (ID:${assistant.id}) for ${pair.month}/${pair.year}.`;
          // create notification
          await prisma.notification.create({
            data: {
              message: msg,
              userID: assistant.managerID, // manager sees this
              managerID: assistant.managerID,
              read: false,
            },
          });
          // broadcast via socket
          const io = app.get("socketio");
          if (io) {
            io.emit("new-notification", {
              message: msg,
              userID: assistant.managerID,
              managerID: assistant.managerID,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("❌ Error in KPI missing check cron (22nd @4PM):", error);
  }
});

/**
 * Same helper from KpiRoute or replicate it
 */
function getAllYearMonthPairsUpToNow() {
  const pairs = [];
  const startYear = 2023;
  const endYear = 2025;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y > currentYear || (y === currentYear && m > currentMonth)) break;
      pairs.push({ year: y, month: m });
    }
  }
  return pairs;
}

/* ---------------------- 7) START SERVER ---------------------- */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

