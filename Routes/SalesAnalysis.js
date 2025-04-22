// Server/Routes/SalesAnalysis.js
import express from "express";
import prisma from "../utils/db.js";
import { authorize } from "../utils/authorize.js";

const router = express.Router();

/**
 * GET /api/sales/analysis?salesPersonCode=265&startDate=2023-01-01&endDate=2023-12-31
 * Returns all SalesData records matching the filters and total net sales.
 * Now accessible to both "Showroom Manager" and "Sales Assistant"
 */
router.get(
  "/analysis",
  authorize(["Showroom Manager", "Sales Assistant"]),
  async (req, res) => {
    try {
      const { salesPersonCode, salesPersonName, startDate, endDate } = req.query;
      const filters = {};

      if (salesPersonCode) {
        // Allow multiple codes separated by commas
        if (salesPersonCode.indexOf(",") > -1) {
          filters.salesPersonCode = { in: salesPersonCode.split(",") };
        } else {
          filters.salesPersonCode = salesPersonCode.toString();
        }
      }
      if (salesPersonName) {
        filters.salesPersonName = salesPersonName;
      }
      if (startDate) {
        filters.saleDate = { ...filters.saleDate, gte: new Date(startDate) };
      }
      if (endDate) {
        filters.saleDate = { ...filters.saleDate, lte: new Date(endDate) };
      }

      const salesRecords = await prisma.salesData.findMany({
        where: filters,
        orderBy: { saleDate: "asc" },
      });

      const totalNetSales = salesRecords.reduce(
        (acc, rec) => acc + rec.netAmount,
        0
      );

      res.json({ salesRecords, totalNetSales });
    } catch (err) {
      console.error("Error fetching sales analysis:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

export { router as salesAnalysisRouter };
