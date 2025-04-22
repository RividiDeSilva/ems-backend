//C:\Users\rivid\OneDrive\Desktop\IIT\Final Year Project\EMS CODING\EMPLOYEE SYSTEM V1\Employee MS\Server\utils\db.js

import { PrismaClient } from '@prisma/client';

// Initialize Prisma Client
const prisma = new PrismaClient();

// Connect to the database
async function connectToDB() {
  try {
    await prisma.$connect();
    console.log("Connected to MongoDB via Prisma");
  } catch (error) {
    console.error("Connection to MongoDB failed", error);
  }
}

// Call the connection function to establish the connection
connectToDB();

// Export the Prisma client to be used in other parts of your application
export default prisma;
