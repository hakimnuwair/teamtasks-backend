import Reminder from "../models/Reminder.js";
import Notification from "../models/Notification.js";
import ActivityLog from "../models/ActivityLog.js";

/**
 * Runs every minute.
 * 1. Marks overdue reminders.
 * 2. Sends due-now notifications (within 1-minute window).
 */
export const startReminderScheduler = (io) => {
  const INTERVAL_MS = 60 * 1000; // 1 minute

  const tick = async () => {
    const now = new Date();
    const oneMinuteLater = new Date(now.getTime() + INTERVAL_MS);

    try {
      // ── 1. Mark overdue ──────────────────────────────────────────────────────
      const overdueResult = await Reminder.updateMany(
        {
          status: "PENDING",
          dueDateTime: { $lt: now },
        },
        { $set: { status: "OVERDUE" } },
      );

      if (overdueResult.modifiedCount > 0) {
        console.log(
          `[Scheduler] Marked ${overdueResult.modifiedCount} reminder(s) as OVERDUE`,
        );
      }

      // ── 2. Send due-now notifications ────────────────────────────────────────
      const dueReminders = await Reminder.find({
        status: "PENDING",
        notificationSent: false,
        dueDateTime: { $gte: now, $lt: oneMinuteLater },
      });

      for (const reminder of dueReminders) {
        const notifications = reminder.assignedUsers.map((userId) => ({
          userId,
          reminderId: reminder._id,
          groupId: reminder.groupId || null,
          type: "REMINDER_DUE",
          message: `Reminder due: "${reminder.title}"`,
        }));

        await Notification.insertMany(notifications);

        reminder.notificationSent = true;
        await reminder.save();

        // Log REMINDER_OVERDUE action
        await ActivityLog.create({
          userId: reminder.createdBy,
          reminderId: reminder._id,
          groupId: reminder.groupId || null,
          action: "REMINDER_OVERDUE",
          metadata: { title: reminder.title },
        });

        // Emit socket events per user
        if (io) {
          reminder.assignedUsers.forEach((userId) => {
            io.to(userId.toString()).emit("notificationTriggered", {
              reminderId: reminder._id,
              title: reminder.title,
              message: `Reminder due: "${reminder.title}"`,
            });
          });
        }

        console.log(
          `[Scheduler] Notifications sent for reminder: ${reminder.title}`,
        );
      }
    } catch (err) {
      console.error("[Scheduler] Error:", err.message);
    }
  };

  // Run immediately on start, then every minute
  tick();
  setInterval(tick, INTERVAL_MS);

  console.log("[Scheduler] Reminder scheduler started ✅");
};
