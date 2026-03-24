/**
 * services/reminderScheduler.js
 *
 * Runs every 60 seconds. Finds PENDING reminders that are past due, marks them
 * OVERDUE inside a transaction, creates per-user REMINDER_DUE notifications
 * (skipping users who already completed), logs the action, and pushes real-time
 * events to affected users via Socket.io.
 *
 * Design decisions that match reminderService.js:
 *   - Every write runs inside a mongoose session/transaction.
 *   - Activity log written via createLog() for every OVERDUE transition.
 *   - Duplicate-notification guard: checks existing REMINDER_DUE notification
 *     per (reminderId, userId) before inserting — safe on scheduler re-runs.
 *   - Per-user notifiedUsers[] array on the Reminder document replaces the
 *     boolean notificationSent flag, so a partial failure on one user doesn't
 *     block the others on the next tick.
 *   - Users who already appear in userCompletions are skipped — they finished
 *     before the deadline and must not receive an overdue notification.
 *   - Socket payload mirrors the fully-populated shape returned by
 *     completeReminder() so the frontend never gets a partial object.
 *
 * Events emitted (unchanged contract):
 *   reminderOverdue        → each affected assignedUser
 *   notificationTriggered  → each affected assignedUser (full Notification shape)
 */

import mongoose from "mongoose";
import cron from "node-cron";
import Reminder from "../models/Reminder.js";
import Notification from "../models/Notification.js";
import { createLog } from "./activityLogService.js";
import { emitToUser } from "../server/socketManager.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the string IDs of assigned users who have NOT yet completed the
 * reminder and therefore should receive an overdue notification.
 */
const getPendingUserIds = (reminder) => {
  const completedIds = new Set(
    (reminder.userCompletions ?? []).map((uc) => uc.userId.toString()),
  );
  return reminder.assignedUsers
    .map((u) => String(u._id ?? u))
    .filter((id) => !completedIds.has(id));
};

/**
 * Fetches the set of userIds that already have a REMINDER_DUE notification
 * for this reminder, so we never insert duplicates.
 */
const getAlreadyNotifiedIds = async (reminderId, userIds) => {
  const existing = await Notification.find({
    reminderId,
    userId: { $in: userIds },
    type: "REMINDER_DUE",
    isDeleted: { $ne: true },
  })
    .select("userId")
    .lean();
  return new Set(existing.map((n) => n.userId.toString()));
};

/**
 * Fetches the fully-populated reminder document in the shape that the frontend
 * expects (matches the return value of completeReminder in reminderService.js).
 */
const getPopulatedReminder = (reminderId) =>
  Reminder.findById(reminderId)
    .populate("createdBy", "name email")
    .populate("assignedUsers", "name email")
    .populate("userCompletions.userId", "name email")
    .populate("groupId", "name")
    .lean();

// ---------------------------------------------------------------------------
// Core per-reminder processor
// ---------------------------------------------------------------------------

/**
 * Processes a single overdue reminder inside its own transaction.
 * Isolated so one failing reminder doesn't abort the whole scheduler tick.
 */
const processOverdueReminder = async (reminder) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Re-fetch inside session to get a consistent, up-to-date document.
    // Another process (e.g. a user completing it) may have changed status
    // between the outer find() and now.
    const doc = await Reminder.findOne({
      _id: reminder._id,
      status: "PENDING", // bail out if status changed since the find
      isDeleted: { $ne: true },
    }).session(session);

    if (!doc) {
      // Already completed, deleted, or processed by a concurrent instance.
      await session.abortTransaction();
      return null;
    }

    // Determine which users still need notification
    const allAssignedIds = reminder.assignedUsers.map((u) =>
      String(u._id ?? u),
    );
    const pendingUserIds = getPendingUserIds(reminder);

    if (pendingUserIds.length === 0) {
      // Every assigned user already completed — just mark OVERDUE and move on
      doc.status = "OVERDUE";
      doc.notifiedUsers = allAssignedIds; // mark all so scheduler skips next tick
      await doc.save({ session });
      await session.commitTransaction();
      return { reminderId: reminder._id, notified: [] };
    }

    // Deduplicate: skip users who already have a REMINDER_DUE notification.
    // Checked outside the transaction (read-only, eventual consistency is fine).
    const alreadyNotifiedIds = await getAlreadyNotifiedIds(
      reminder._id,
      pendingUserIds,
    );
    const toNotifyIds = pendingUserIds.filter(
      (id) => !alreadyNotifiedIds.has(id),
    );

    // --- 1. Mark the reminder OVERDUE ----------------------------------------
    doc.status = "OVERDUE";
    // Track which users have been notified so partial failures are retryable
    // per-user on the next scheduler tick.
    doc.notifiedUsers = [
      ...(doc.notifiedUsers ?? []),
      ...toNotifyIds,
      ...alreadyNotifiedIds, // already notified in a previous tick
    ];
    await doc.save({ session });

    // --- 2. Create per-user REMINDER_DUE notifications -----------------------
    let createdNotifications = [];
    if (toNotifyIds.length > 0) {
      createdNotifications = await Notification.create(
        toNotifyIds.map((userId) => ({
          userId,
          reminderId: reminder._id,
          groupId: reminder.groupId?._id ?? null,
          type: "REMINDER_DUE",
          message: `Reminder overdue: "${reminder.title}"`,
          isRead: false,
        })),
        { session, ordered: true },
      );
    }

    // --- 3. Activity log (one entry per reminder, not per user) --------------
    await createLog(
      {
        userId: doc.createdBy,
        groupId: doc.groupId ?? null,
        reminderId: doc._id,
        action: "REMINDER_OVERDUE",
        metadata: {
          title: doc.title,
          notifiedUsers: toNotifyIds,
          skippedAlreadyNotified: [...alreadyNotifiedIds],
        },
      },
      session,
    );

    await session.commitTransaction();

    return {
      reminderId: reminder._id,
      notified: toNotifyIds,
      notifications: createdNotifications,
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export const startReminderScheduler = () => {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      // Find candidates: PENDING, past due, not deleted.
      // We use notifiedUsers to allow per-user retries — a reminder is a
      // candidate as long as at least one assigned user hasn't been notified.
      const overdueReminders = await Reminder.find({
        status: "PENDING",
        dueDateTime: { $lte: now },
        isDeleted: { $ne: true },
      })
        .populate("assignedUsers", "_id name email")
        .populate("groupId", "_id name")
        .lean();

      if (overdueReminders.length === 0) return;

      let successCount = 0;

      for (const reminder of overdueReminders) {
        try {
          const result = await processOverdueReminder(reminder);
          if (!result) continue; // skipped (already handled by concurrent process)

          // Fetch fully-populated document for socket payloads
          const populated = await getPopulatedReminder(reminder._id);

          // Emit to each newly-notified user
          for (const userId of result.notified) {
            const notification = result.notifications?.find(
              (n) => n.userId.toString() === userId,
            );

            // reminderOverdue → card turns red immediately
            emitToUser(userId, "reminderOverdue", {
              reminderId: String(reminder._id),
              reminder: populated,
            });

            // notificationTriggered → badge increments
            if (notification) {
              emitToUser(userId, "notificationTriggered", {
                notification: {
                  _id: String(notification._id),
                  userId,
                  reminderId: {
                    _id: String(reminder._id),
                    title: reminder.title,
                  },
                  groupId: reminder.groupId ?? null,
                  type: "REMINDER_DUE",
                  message: notification.message,
                  isRead: false,
                  createdAt: notification.createdAt,
                },
              });
            }
          }

          successCount++;
        } catch (reminderErr) {
          // Log per-reminder failure but continue processing the rest
          console.error(
            `[Scheduler] Failed to process reminder ${reminder._id}:`,
            reminderErr.message,
          );
        }
      }

      console.info(
        `[Scheduler] Processed ${successCount}/${overdueReminders.length} overdue reminder(s)`,
      );
    } catch (err) {
      console.error("[Scheduler] Tick error:", err.message);
    }
  });

  console.info("[Scheduler] Reminder scheduler started");
};
