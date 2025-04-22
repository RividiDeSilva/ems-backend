/************************************************************
 * addKpiData.js
 *
 * Inserts/Upserts KPI rows for code="254"
 * (Ranathung Liyanage Malik Manoj Kumara),
 * covering months from 2023-01 through 2024-12.
 *
 * Usage:
 *   1) Ensure your schema has `salesPersonName`.
 *   2) npx prisma generate && npx prisma db push
 *   3) node addKpiData.js
 ************************************************************/
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The name for salesPersonCode = 254
const name254 = "Ranathung Liyanage Malik Manoj Kumara";

/**
 * KPI data array for code=254, each row = { year, month, punctuality, discipline, environment, salesPerformance, customerSatisfaction, totalScore }
 */
const kpiData254 = [
  // 2023
  { year: 2023, month:  1, punctuality: 7, discipline: 7, environment: 8, salesPerformance: 6, customerSatisfaction: 7, totalScore: 35 },
  { year: 2023, month:  2, punctuality: 8, discipline: 6, environment: 7, salesPerformance: 5, customerSatisfaction: 6, totalScore: 32 },
  { year: 2023, month:  3, punctuality: 6, discipline: 5, environment: 8, salesPerformance: 8, customerSatisfaction: 7, totalScore: 34 },
  { year: 2023, month:  4, punctuality: 5, discipline: 4, environment: 7, salesPerformance: 5, customerSatisfaction: 5, totalScore: 26 },
  { year: 2023, month:  5, punctuality: 6, discipline: 6, environment: 6, salesPerformance: 7, customerSatisfaction: 6, totalScore: 31 },
  { year: 2023, month:  6, punctuality: 7, discipline: 7, environment: 7, salesPerformance: 9, customerSatisfaction: 8, totalScore: 38 },
  { year: 2023, month:  7, punctuality: 8, discipline: 6, environment: 7, salesPerformance: 8, customerSatisfaction: 7, totalScore: 36 },
  { year: 2023, month:  8, punctuality: 6, discipline: 5, environment: 5, salesPerformance: 4, customerSatisfaction: 5, totalScore: 25 },
  { year: 2023, month:  9, punctuality: 7, discipline: 7, environment: 8, salesPerformance: 9, customerSatisfaction: 8, totalScore: 39 },
  { year: 2023, month: 10, punctuality: 8, discipline: 8, environment: 8, salesPerformance: 10, customerSatisfaction: 8, totalScore: 42 },
  { year: 2023, month: 11, punctuality: 8, discipline: 6, environment: 7, salesPerformance: 8, customerSatisfaction: 7, totalScore: 36 },
  { year: 2023, month: 12, punctuality: 7, discipline: 7, environment: 6, salesPerformance: 4, customerSatisfaction: 6, totalScore: 30 },

  // 2024
  { year: 2024, month:  1, punctuality: 8, discipline: 8, environment: 8, salesPerformance: 8, customerSatisfaction: 8, totalScore: 40 },
  { year: 2024, month:  2, punctuality: 6, discipline: 5, environment: 6, salesPerformance: 5, customerSatisfaction: 6, totalScore: 28 },
  { year: 2024, month:  3, punctuality: 5, discipline: 4, environment: 7, salesPerformance: 7, customerSatisfaction: 7, totalScore: 30 },
  { year: 2024, month:  4, punctuality: 7, discipline: 7, environment: 6, salesPerformance: 6, customerSatisfaction: 7, totalScore: 33 },
  { year: 2024, month:  5, punctuality: 4, discipline: 3, environment: 5, salesPerformance: 3, customerSatisfaction: 5, totalScore: 20 },
  { year: 2024, month:  6, punctuality: 7, discipline: 8, environment: 7, salesPerformance: 9, customerSatisfaction: 8, totalScore: 39 },
  { year: 2024, month:  7, punctuality: 8, discipline: 7, environment: 8, salesPerformance: 10, customerSatisfaction: 9, totalScore: 42 },
  { year: 2024, month:  8, punctuality: 6, discipline: 6, environment: 7, salesPerformance: 7, customerSatisfaction: 6, totalScore: 32 },
  { year: 2024, month:  9, punctuality: 8, discipline: 8, environment: 9, salesPerformance: 9, customerSatisfaction: 8, totalScore: 42 },
  { year: 2024, month: 10, punctuality: 7, discipline: 6, environment: 7, salesPerformance: 5, customerSatisfaction: 6, totalScore: 31 },
  { year: 2024, month: 11, punctuality: 6, discipline: 5, environment: 6, salesPerformance: 4, customerSatisfaction: 5, totalScore: 26 },
  { year: 2024, month: 12, punctuality: 7, discipline: 6, environment: 7, salesPerformance: 7, customerSatisfaction: 7, totalScore: 34 },
];

async function addKpiData254() {
  try {
    const code = "254";

    for (const row of kpiData254) {
      await prisma.kPI.upsert({
        where: {
          salesPersonCode_year_month: {
            salesPersonCode: code,
            year: row.year,
            month: row.month,
          },
        },
        update: {
          salesPersonName: name254,
          punctuality: row.punctuality,
          discipline: row.discipline,
          environment: row.environment,
          salesPerformance: row.salesPerformance,
          customerSatisfaction: row.customerSatisfaction,
          totalScore: row.totalScore,
        },
        create: {
          salesPersonCode: code,
          salesPersonName: name254,
          year: row.year,
          month: row.month,
          punctuality: row.punctuality,
          discipline: row.discipline,
          environment: row.environment,
          salesPerformance: row.salesPerformance,
          customerSatisfaction: row.customerSatisfaction,
          totalScore: row.totalScore,
        },
      });

      console.log(
        `Upserted KPI => code=${code}, year=${row.year}, month=${row.month}, totalScore=${row.totalScore}`
      );
    }
  } catch (err) {
    console.error("❌ Error inserting KPI data for code=254:", err);
  } finally {
    await prisma.$disconnect();
    console.log("✅ Done.");
  }
}

addKpiData254();
