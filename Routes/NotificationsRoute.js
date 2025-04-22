//C:\Users\rivid\OneDrive\Desktop\IIT\Final Year Project\EMS CODING\EMPLOYEE SYSTEM V1\Employee MS\Server\Routes\NotificationsRoute.js

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authorize } from '../utils/authorize.js';

const prisma = new PrismaClient();
const notificationRouter = express.Router();

// Fetch notifications for the logged-in user
notificationRouter.get(
  "/",
  authorize(["Showroom Manager", "Sales Assistant", "Showroom Assistant Manager"]),
  async (req, res) => {
    try {
      console.log("Checking Authorization for:", req.user?.id || "Undefined");
      console.log("Role:", req.user?.role || "Undefined");

      if (!req.user?.id) {
        return res.status(400).json({ error: "User ID missing from request" });
      }

      // ✅ Corrected query (removed Task reference)
      const notifications = await prisma.notification.findMany({
        where: {
          OR: [
            { userID: String(req.user.id) },  // Employee notifications
            { managerID: String(req.user.id) }, // Manager notifications
          ],
        },
        orderBy: { createdAt: "desc" },
      });

      console.log(`Fetched ${notifications.length} Notifications for User ID: ${req.user.id}`);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Database error" });
    }
  }
);



// Mark a notification as read
// Mark a notification as read
notificationRouter.patch(
  "/:notificationId/read",
  authorize(["Showroom Manager", "Sales Assistant", "Showroom Assistant Manager"]),
  async (req, res) => {
    const { notificationId } = req.params;

    try {
      // Ensure the notification exists before updating
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }

      // Update the notification as read
      const updatedNotification = await prisma.notification.update({
        where: { id: notificationId },
        data: { read: true },
      });

      res.json(updatedNotification); // Send back updated notification
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Database error" });
    }
  }
);

export default notificationRouter;
