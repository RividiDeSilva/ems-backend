// addData.js
import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

// 1) Instantiate Prisma
const prisma = new PrismaClient();

// 2) ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 3) Point to your Excel file (update path as needed)
const excelFilePath = "C:/Users/rivid/Downloads/ADD.xlsx";

// 4) Helper: Parse a row's date/time from the Excel sheet
function parseDateTime(rowDate, rowTime) {
  // If rowDate is a number, assume it's an Excel date code.
  if (typeof rowDate === "number") {
    // If rowTime is also numeric, add them together.
    const timeVal = typeof rowTime === "number" ? rowTime : 0;
    // XLSX.SSF.parse_date_code converts Excel numeric date/time into a JS date.
    const parsed = XLSX.SSF.parse_date_code(rowDate + timeVal);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S);
  } else if (typeof rowDate === "string") {
    // If rowDate is a string, combine with rowTime if provided.
    let combined = rowDate;
    if (typeof rowTime === "string" && rowTime.trim() !== "") {
      combined += " " + rowTime;
    }
    const jsDate = new Date(combined);
    return isNaN(jsDate) ? null : jsDate;
  }
  return null;
}

async function addSalesData() {
  try {
    // 5.1) Read the workbook
    const workbook = XLSX.readFile(excelFilePath);

    // 5.2) Get the first sheet (assuming your data is in the first sheet)
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // 5.3) Convert the sheet to JSON (each row becomes an object)
    let data = XLSX.utils.sheet_to_json(sheet, { raw: true });
    console.log(`Read ${data.length} rows from Excel.`);

    // 5.4) Group rows by year-month (to compute monthly cumulative sales)
    const groups = {}; // e.g., groups["2023-1"]

    for (const row of data) {
      const rowDate = row.DATE; // expected to be "1/1/2023" (string) or an Excel date code (number)
      const rowTime = row.Time; // expected to be "10:21:59 AM" (string)
      const jsDate = parseDateTime(rowDate, rowTime);

      if (!jsDate) {
        console.warn(`Skipping row. Could not parse => DATE=[${rowDate}] TIME=[${rowTime}]`);
        continue;
      }

      // Parse NetAmount as a float
      const net = parseFloat(row.NetAmount) || 0;

      // Build the group key using year and month
      const y = jsDate.getFullYear();
      const m = jsDate.getMonth() + 1; // Month is 0-indexed, so add 1
      const groupKey = `${y}-${m}`;

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push({
        jsDate,
        code: row.SalesPersonCode ? row.SalesPersonCode.toString() : "",
        name: row.SalesPersonName || "",
        net,
      });
    }

    // 5.5) Debug: log group keys to see if 2024 groups exist
    console.log("Group keys found:", Object.keys(groups));

    // 5.6) Process each group: sort by date, compute cumulative sales, then insert in batches
    const batchSize = 1000;
    for (const groupKey of Object.keys(groups)) {
      const groupRows = groups[groupKey];
      // Sort rows in ascending order of saleDate
      groupRows.sort((a, b) => a.jsDate - b.jsDate);

      let cumulative = 0;
      const salesRecords = groupRows.map(item => {
        cumulative += item.net;
        return {
          saleDate: item.jsDate,
          salesPersonCode: item.code,
          salesPersonName: item.name,
          netAmount: item.net,
          cumulativeNetAmount: cumulative,
          managerID: "52" // Hardcoded as per your requirement
        };
      });

      // Insert salesRecords in batches
      for (let i = 0; i < salesRecords.length; i += batchSize) {
        const batch = salesRecords.slice(i, i + batchSize);
        await prisma.salesData.createMany({ data: batch });
        console.log(`Group ${groupKey}: Inserted rows ${i + 1} to ${i + batch.length} of ${salesRecords.length}`);
      }
    }

    console.log("✅ Done inserting all sales data (with monthly cumulative).");
  } catch (error) {
    console.error("❌ Error inserting sales data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// 6) Run the function
addSalesData();
