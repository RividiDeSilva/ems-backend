import express from "express";
import { PrismaClient } from "@prisma/client";
import { authorize } from "../utils/authorize.js";

const prisma = new PrismaClient();
export const kpiRouter = express.Router();

/**
 * Helper to enumerate all (year, month) pairs from Jan 2023 up to the current (or up to 2025).
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

/**
 * (A) GET /api/kpis/missing?mode=all
 * Shows missing KPI for all direct reports. (Unchanged)
 */
kpiRouter.get("/missing", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    const managerID = req.user.id;
    const mode = req.query.mode || "monthOnly";

    // 1) Find direct reports
    const directReports = await prisma.teamMember.findMany({
      where: { managerID, role: "Sales Assistant" },
      select: { id: true, fullName: true, salesPersonCode: true },
    });
    if (directReports.length === 0) return res.json([]);

    // 2) Build array of missing KPI
    const missingKpis = [];
    if (mode === "all") {
      const allPairs = getAllYearMonthPairsUpToNow();
      for (const r of directReports) {
        if (!r.salesPersonCode) continue;
        for (const pair of allPairs) {
          const existing = await prisma.kPI.findUnique({
            where: {
              salesPersonCode_year_month: {
                salesPersonCode: r.salesPersonCode,
                year: pair.year,
                month: pair.month,
              },
            },
          });
          if (!existing) {
            missingKpis.push({
              employeeName: r.fullName,
              employeeCode: r.salesPersonCode,
              month: pair.month,
              year: pair.year,
            });
          }
        }
      }
    } else {
      // Only check current month
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      for (const r of directReports) {
        if (!r.salesPersonCode) continue;
        const existing = await prisma.kPI.findUnique({
          where: {
            salesPersonCode_year_month: {
              salesPersonCode: r.salesPersonCode,
              year: currentYear,
              month: currentMonth,
            },
          },
        });
        if (!existing) {
          missingKpis.push({
            employeeName: r.fullName,
            employeeCode: r.salesPersonCode,
            month: currentMonth,
            year: currentYear,
          });
        }
      }
    }
    return res.json(missingKpis);
  } catch (err) {
    console.error("❌ Error fetching missing KPI records:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * (B) POST /api/kpis
 * Create or Update KPI for a single employee (manager only).
 *
 * Key Change:
 *  - We now only check older months for the *one* employee (the userID) being updated,
 *    instead of for all direct reports.
 */
kpiRouter.post("/", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    const {
      userID,
      month,
      year,
      punctuality,
      discipline,
      maintenanceOfWorkArea,
      salesPerformance,
      customerSatisfaction,
      feedback,
    } = req.body;

    if (!userID || !month || !year) {
      return res.status(400).json({ error: "userID, month, and year are required." });
    }
    const monthInt = parseInt(month, 10);
    const yearInt = parseInt(year, 10);
    if (monthInt < 1 || monthInt > 12) {
      return res.status(400).json({ error: "Month must be between 1 and 12." });
    }
    if (yearInt < 2023 || yearInt > 2025) {
      return res.status(400).json({ error: "Year must be between 2023 and 2025." });
    }

    // (Optional) If you want to block updating older months at all:
    // Compare chosen (yearInt/monthInt) with the current date
    const now = new Date();
    const currentY = now.getFullYear();
    const currentM = now.getMonth() + 1;
    const chosenVal = yearInt * 12 + monthInt;
    const currentVal = currentY * 12 + currentM;
    if (chosenVal < currentVal) {
      // If you want to block updates to older months, uncomment this:
      // return res.status(400).json({ error: "Cannot update older KPI. It is locked." });
    }

    // 1) Check older months for *this one employee*,
    //    instead of checking for all directReports.
    const allPairs = getAllYearMonthPairsUpToNow().filter(
      (pair) => pair.year < yearInt || (pair.year === yearInt && pair.month < monthInt)
    );

    // 2) Find the *single* TeamMember we are updating
    const teamMember = await prisma.teamMember.findUnique({ where: { id: userID } });
    if (!teamMember) {
      return res.status(404).json({ error: "TeamMember not found." });
    }
    if (!teamMember.salesPersonCode) {
      return res.status(400).json({
        error: "This user does not have a salesPersonCode.",
      });
    }

    // 3) For each older month for *this user*, check if it exists
    for (const p of allPairs) {
      const olderRecord = await prisma.kPI.findUnique({
        where: {
          salesPersonCode_year_month: {
            salesPersonCode: teamMember.salesPersonCode,
            year: p.year,
            month: p.month,
          },
        },
      });
      if (!olderRecord) {
        return res.status(400).json({
          error: `Cannot proceed. KPI for ${teamMember.fullName} is missing for ${p.month}/${p.year}. Complete older months first!`,
        });
      }
    }

    // 4) Compute total
    const total =
      Number(punctuality || 0) +
      Number(discipline || 0) +
      Number(maintenanceOfWorkArea || 0) +
      Number(salesPerformance || 0) +
      Number(customerSatisfaction || 0);

    // 5) Upsert KPI record
    const result = await prisma.kPI.upsert({
      where: {
        salesPersonCode_year_month: {
          salesPersonCode: teamMember.salesPersonCode,
          year: yearInt,
          month: monthInt,
        },
      },
      update: {
        salesPersonName: teamMember.fullName,
        punctuality: Number(punctuality || 0),
        discipline: Number(discipline || 0),
        environment: Number(maintenanceOfWorkArea || 0),
        salesPerformance: Number(salesPerformance || 0),
        customerSatisfaction: Number(customerSatisfaction || 0),
        totalScore: total,
        feedback: feedback || null,
        // locked: false, // If you no longer want a 'locked' field, remove or ignore
      },
      create: {
        salesPersonCode: teamMember.salesPersonCode,
        salesPersonName: teamMember.fullName,
        year: yearInt,
        month: monthInt,
        punctuality: Number(punctuality || 0),
        discipline: Number(discipline || 0),
        environment: Number(maintenanceOfWorkArea || 0),
        salesPerformance: Number(salesPerformance || 0),
        customerSatisfaction: Number(customerSatisfaction || 0),
        totalScore: total,
        feedback: feedback || null,
        // locked: false,
      },
    });

    // 6) Create notifications for both manager & assistant
    const managerID = req.user.id;

    // Assistant gets a notification
    const notifAssistant = await prisma.notification.create({
      data: {
        message: `A new KPI has been assigned/updated for you (Month: ${monthInt}/${yearInt}, Score: ${total}).`,
        userID: teamMember.id,
        managerID: managerID,
        read: false,
      },
    });

    // Manager also gets a notification
    const notifManager = await prisma.notification.create({
      data: {
        message: `You assigned/updated a KPI for ${teamMember.fullName} (Code: ${teamMember.salesPersonCode}) with total score ${total}.`,
        userID: managerID,
        managerID: managerID,
        read: false,
      },
    });

    // 7) Broadcast new-notification event via Socket.IO
    const io = req.app.get("socketio");
    if (io) {
      io.emit("new-notification", notifAssistant);
      io.emit("new-notification", notifManager);
    }

    return res.json(result);
  } catch (err) {
    console.error("❌ Error creating/updating KPI:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * (C) GET /api/kpis/history/by-user?userID=...
 * For a single user’s KPI history.
 */
kpiRouter.get("/history/by-user", authorize(["Sales Assistant", "Showroom Manager"]), async (req, res) => {
  try {
    const { userID } = req.query;
    if (!userID) {
      return res.status(400).json({ error: "userID is required." });
    }
    const member = await prisma.teamMember.findUnique({ where: { id: userID } });
    if (!member) {
      return res.status(404).json({ error: "TeamMember not found." });
    }
    if (!member.salesPersonCode) {
      return res.status(400).json({ error: "salesPersonCode not set for this user." });
    }

    const records = await prisma.kPI.findMany({
      where: { salesPersonCode: member.salesPersonCode },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    return res.json(records);
  } catch (err) {
    console.error("❌ Error fetching KPI by user:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * (D) GET /api/kpis/all
 * Manager can see all KPI records for all employees.
 */
kpiRouter.get("/all", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    const all = await prisma.kPI.findMany({
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    return res.json(all);
  } catch (err) {
    console.error("❌ Error fetching all KPI:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * (E) GET /api/kpis/top-performers?year=YYYY&month=MM
 * Return monthly KPI sorted by totalScore desc
 */
kpiRouter.get("/top-performers", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      return res.status(400).json({ error: "year and month query params required." });
    }
    const results = await prisma.kPI.findMany({
      where: {
        year: Number(year),
        month: Number(month),
      },
      orderBy: { totalScore: "desc" },
    });
    return res.json(results);
  } catch (err) {
    console.error("❌ Error fetching top performers:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * (F) GET /api/kpis/team-averages
 * Return overall team average + best/worst month
 */
kpiRouter.get("/team-averages", authorize(["Showroom Manager"]), async (req, res) => {
  try {
    const all = await prisma.kPI.findMany({});
    if (!all || all.length === 0) {
      return res.json({ overallAvg: 0, bestMonth: null, worstMonth: null });
    }
    const sum = all.reduce((acc, k) => acc + (k.totalScore || 0), 0);
    const avg = sum / all.length;

    const mapYM = {};
    all.forEach((k) => {
      const key = `${k.year}-${k.month}`;
      if (!mapYM[key]) mapYM[key] = [];
      mapYM[key].push(k.totalScore);
    });

    const arrayOfYM = Object.entries(mapYM).map(([ym, scores]) => {
      const ssum = scores.reduce((acc, val) => acc + val, 0);
      return { ym, avgMonth: ssum / scores.length };
    });
    arrayOfYM.sort((a, b) => b.avgMonth - a.avgMonth);

    const best = arrayOfYM[0];
    const worst = arrayOfYM[arrayOfYM.length - 1];
    return res.json({
      overallAvg: avg,
      bestMonth: best ? best.ym : null,
      worstMonth: worst ? worst.ym : null,
    });
  } catch (err) {
    console.error("❌ Error computing team averages:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * (G) GET /api/kpis/rankings/monthly?year=YYYY&month=MM
 * Return monthly KPI with "rank" field.
 */
kpiRouter.get("/rankings/monthly", authorize(["Showroom Manager", "Sales Assistant"]), async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      return res
        .status(400)
        .json({ error: "year and month query parameters are required." });
    }
    const records = await prisma.kPI.findMany({
      where: { year: Number(year), month: Number(month) },
      orderBy: { totalScore: "desc" },
    });
    const rankings = records.map((record, index) => ({
      ...record,
      rank: index + 1,
    }));
    res.json(rankings);
  } catch (err) {
    console.error("❌ Error fetching monthly rankings:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * (H) GET /api/kpis/rankings/all
 * Return all-time aggregated by salesPersonCode => average totalScore => sorted => rank
 */
kpiRouter.get("/rankings/all", authorize(["Showroom Manager", "Sales Assistant"]), async (req, res) => {
  try {
    const records = await prisma.kPI.findMany({});
    if (!records || records.length === 0) return res.json([]);
    const aggregation = {};
    records.forEach((record) => {
      const code = record.salesPersonCode;
      if (!aggregation[code]) {
        aggregation[code] = { total: 0, count: 0, salesPersonCode: code };
      }
      aggregation[code].total += record.totalScore;
      aggregation[code].count += 1;
    });

    const aggregatedArray = Object.values(aggregation).map((item) => ({
      salesPersonCode: item.salesPersonCode,
      avgScore: item.total / item.count,
    }));
    aggregatedArray.sort((a, b) => b.avgScore - a.avgScore);

    const rankings = aggregatedArray.map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
    res.json(rankings);
  } catch (err) {
    console.error("❌ Error fetching all-time rankings:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
