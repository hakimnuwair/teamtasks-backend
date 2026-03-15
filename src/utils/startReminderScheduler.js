/**
 * utils/startReminderScheduler.js — COMPLETE REPLACEMENT
 * Place at: utils/startReminderScheduler.js
 *
 * KEY FIX: All socket emits now target individual user rooms via io.to(userId).
 * Old code used io.emit() which broadcast to ALL connected clients — a
 * major security/privacy bug where every user would receive every reminder alert.
 *
 * Runs every 60 seconds:
 *  1. Find PENDING reminders past their dueDateTime with notificationSent: false
 *  2. Mark them OVERDUE
 *  3. Create REMINDER_DUE notifications for each assigned user
 *  4. Emit "notificationTriggered" to each user's personal socket room
 */

import cron from "node-cron";
import Reminder from "../models/Reminder.js";
import Notification from "../models/Notification.js";
import { createLog } from "../services/activityLogService.js";

export const startReminderScheduler = (io) => {
  // Run every 60 seconds
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      // Find overdue reminders that haven't been notified yet
      const overdueReminders = await Reminder.find({
        status: "PENDING",
        dueDateTime: { $lte: now },
        notificationSent: false,
        isDeleted: false,
      }).lean();

      if (overdueReminders.length === 0) return;

      console.log(
        `[Scheduler] Processing ${overdueReminders.length} overdue reminder(s)`,
      );

      for (const reminder of overdueReminders) {
        try {
          // 1. Mark as OVERDUE
          await Reminder.findByIdAndUpdate(reminder._id, {
            status: "OVERDUE",
            notificationSent: true,
          });

          // 2. Create a REMINDER_DUE notification for every assigned user
          const notifDocs = (reminder.assignedUsers || []).map((uid) => ({
            userId: uid,
            reminderId: reminder._id,
            groupId: reminder.groupId || null,
            type: "REMINDER_DUE",
            message: `Reminder "${reminder.title}" is overdue`,
          }));

          if (notifDocs.length > 0) {
            await Notification.insertMany(notifDocs);
          }

          // 3. Emit to each assigned user's personal socket room
          for (const uid of reminder.assignedUsers || []) {
            const userId = String(uid);
            io.to(userId).emit("notificationTriggered", {
              message: `Reminder "${reminder.title}" is overdue`,
              title: reminder.title,
              reminderId: String(reminder._id),
            });
          }

          // 4. Log the event
          await createLog({
            userId: reminder.createdBy,
            reminderId: reminder._id,
            groupId: reminder.groupId || null,
            action: "REMINDER_OVERDUE",
            metadata: { title: reminder.title },
          });
        } catch (innerErr) {
          // Don't let one reminder failure stop the rest
          console.error(
            `[Scheduler] Error processing reminder ${reminder._id}:`,
            innerErr.message,
          );
        }
      }
    } catch (err) {
      console.error("[Scheduler] Fatal error:", err);
    }
  });

  console.log("[Scheduler] Reminder scheduler started (runs every 60s)");
};
