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
import cron from "node-cron";
import { Server } from "socket.io";
import notificationRouter from "./Routes/NotificationsRoute.js";
import { leaveRouter } from "./Routes/LeaveRoute.js";
import { teamMembersRouter } from "./Routes/TeamMembers.js";
import { kpiRouter } from "./Routes/KpiRoute.js";
import { salesAnalysisRouter } from "./Routes/SalesAnalysis.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";


dotenv.config();
const app = express();

/* ---------------------- 1) CORS CONFIG ---------------------- */
app.use(cors({
  origin: "http://localhost:5173",  // Your frontend origin
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
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

app.get(
  "/api/sales/available_dates",
  authorize(),             // if you want this protected
  async (req, res, next) => {
    try {
      const code = req.query.SalesPersonCode;
      if (!code) return res.status(400).json({ error: "Missing SalesPersonCode" });

      // open the SQLite file
      const db = await open({
        filename: "./daily_forecast.db",
        driver: sqlite3.Database
      });

      // fetch dates
      const rows = await db.all(
        "SELECT DATE FROM daily_forecast WHERE SalesPersonCode = ?",
        code
      );
      await db.close();

      // return just the date strings
      res.json(rows.map(r => r.DATE));
    } catch (err) {
      next(err);
    }
  }
);

  /* ------------------------------------------------------------------
     CRON JOB: Overdue & Repeating Tasks (runs daily @ 00:00)
  ------------------------------------------------------------------ */
  cron.schedule("0 0 * * *", async () => {
    console.log("🕛 cron: marking overdue + creating repeats…");

    const startOfToday = new Date();
       startOfToday.setHours(0, 0, 0, 0);
       await prisma.task.updateMany({
         where: {
           status:  "In Progress",
           dueDate: { lt: startOfToday },
         },
         data: { status: "Late", completed: false },
       });

    // for any repeating task whose dueDate < today, spawn the next one
    const toRepeat = await prisma.task.findMany({
        where: {
          frequency: { in: ["Daily", "Weekly", "Monthly"] },
          dueDate: { lt: startOfToday },
        },
      });

    for (let old of toRepeat) {
      const nextDue = getNextDueDate(old.dueDate, old.frequency);
      const newDesc = `${old.description} (${nextDue.toLocaleDateString()})`;
      const created = await prisma.task.create({
        data: {
          description:  newDesc,
          assignedById: old.assignedById,
          assignedToId: old.assignedToId,
          dueDate:      nextDue,
          frequency:    old.frequency,
          priority:     old.priority,
          completed:    false,
          status:       "In Progress",
        }
      });
      app.get("socketio").emit("new-task", created);
    }
  });


  /** helper to compute the next due date for a repeating task */
  function getNextDueDate(oldDate, freq) {
    const d = oldDate ? new Date(oldDate) : new Date();
    switch (freq) {
      case "Daily":   d.setDate(d.getDate()+1); break;
      case "Weekly":  d.setDate(d.getDate()+7); break;
      case "Monthly": d.setMonth(d.getMonth()+1); break;
    }
    d.setHours(23, 59, 59, 999);
    return d;
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

// New cron:
cron.schedule("0 0 1 * *", async () => {
  try {
    console.log("🔄 Resetting monthlyLeavesUsed counters for all users…");
    await prisma.teamMember.updateMany({}, {
      data: { monthlyLeavesUsed: 0 }
    });
    console.log("✅ monthlyLeavesUsed reset");
  } catch (e) {
    console.error("❌ Failed to reset monthlyLeavesUsed:", e);
  }
});

/* ---------------------- 7) START SERVER ---------------------- */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

