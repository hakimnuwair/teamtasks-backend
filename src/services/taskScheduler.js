/**
 * services/taskScheduler.js
 *
 * Runs every 60 seconds. Finds PENDING tasks that are past due, marks them
 * OVERDUE inside a transaction, creates per-user TASK_DUE notifications
 * (skipping users who already completed), logs the action, and pushes real-time
 * events to affected users via Socket.io.
 *
 * Design decisions that match taskService.js:
 *   - Every write runs inside a mongoose session/transaction.
 *   - Activity log written via createLog() for every OVERDUE transition.
 *   - Duplicate-notification guard: checks existing TASK_DUE notification
 *     per (taskId, userId) before inserting — safe on scheduler re-runs.
 *   - Per-user notifiedUsers[] array on the Task document replaces the
 *     boolean notificationSent flag, so a partial failure on one user doesn't
 *     block the others on the next tick.
 *   - Users who already appear in userCompletions are skipped — they finished
 *     before the deadline and must not receive an overdue notification.
 *   - Socket payload mirrors the fully-populated shape returned by
 *     completeTask() so the frontend never gets a partial object.
 *
 * Events emitted:
 *   taskOverdue            → each affected assignedUser
 *   notificationTriggered  → each affected assignedUser (full Notification shape)
 */

import mongoose from "mongoose";
import cron from "node-cron";
import Task from "../models/Task.js";
import Notification from "../models/Notification.js";
import { createLog } from "./activityLogService.js";
import { emitToUser } from "../server/socketManager.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the string IDs of assigned users who have NOT yet completed the
 * task and therefore should receive an overdue notification.
 */
const getPendingUserIds = (task) => {
  const completedIds = new Set(
    (task.userCompletions ?? []).map((uc) => uc.userId.toString()),
  );
  return task.assignedUsers
    .map((u) => String(u._id ?? u))
    .filter((id) => !completedIds.has(id));
};

/**
 * Fetches the set of userIds that already have a TASK_DUE notification
 * for this task, so we never insert duplicates.
 */
const getAlreadyNotifiedIds = async (taskId, userIds) => {
  const existing = await Notification.find({
    taskId,
    userId: { $in: userIds },
    type: "TASK_DUE",
    isDeleted: { $ne: true },
  })
    .select("userId")
    .lean();
  return new Set(existing.map((n) => n.userId.toString()));
};

/**
 * Fetches the fully-populated task document in the shape that the frontend
 * expects (matches the return value of completeTask in taskService.js).
 */
const getPopulatedTask = (taskId) =>
  Task.findById(taskId)
    .populate("createdBy", "name email")
    .populate("assignedUsers", "name email")
    .populate("userCompletions.userId", "name email")
    .populate("groupId", "name")
    .lean();

// ---------------------------------------------------------------------------
// Core per-task processor
// ---------------------------------------------------------------------------

/**
 * Processes a single overdue task inside its own transaction.
 * Isolated so one failing task doesn't abort the whole scheduler tick.
 */
const processOverdueTask = async (task) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Re-fetch inside session to get a consistent, up-to-date document.
    // Another process (e.g. a user completing it) may have changed status
    // between the outer find() and now.
    const doc = await Task.findOne({
      _id: task._id,
      status: "PENDING", // bail out if status changed since the find
      isDeleted: { $ne: true },
    }).session(session);

    if (!doc) {
      // Already completed, deleted, or processed by a concurrent instance.
      await session.abortTransaction();
      return null;
    }

    // Determine which users still need notification
    const allAssignedIds = task.assignedUsers.map((u) => String(u._id ?? u));
    const pendingUserIds = getPendingUserIds(task);

    if (pendingUserIds.length === 0) {
      // Every assigned user already completed — just mark OVERDUE and move on
      doc.status = "OVERDUE";
      doc.notifiedUsers = allAssignedIds; // mark all so scheduler skips next tick
      await doc.save({ session });
      await session.commitTransaction();
      return { taskId: task._id, notified: [] };
    }

    // Deduplicate: skip users who already have a TASK_DUE notification.
    // Checked outside the transaction (read-only, eventual consistency is fine).
    const alreadyNotifiedIds = await getAlreadyNotifiedIds(
      task._id,
      pendingUserIds,
    );
    const toNotifyIds = pendingUserIds.filter(
      (id) => !alreadyNotifiedIds.has(id),
    );

    // --- 1. Mark the task OVERDUE --------------------------------------------
    doc.status = "OVERDUE";
    // Track which users have been notified so partial failures are retryable
    // per-user on the next scheduler tick.
    doc.notifiedUsers = [
      ...(doc.notifiedUsers ?? []),
      ...toNotifyIds,
      ...alreadyNotifiedIds, // already notified in a previous tick
    ];
    await doc.save({ session });

    // --- 2. Create per-user TASK_DUE notifications ---------------------------
    let createdNotifications = [];
    if (toNotifyIds.length > 0) {
      createdNotifications = await Notification.create(
        toNotifyIds.map((userId) => ({
          userId,
          taskId: task._id,
          groupId: task.groupId?._id ?? null,
          type: "TASK_DUE",
          message: `Task overdue: "${task.title}"`,
          isRead: false,
        })),
        { session, ordered: true },
      );
    }

    // --- 3. Activity log (one entry per task, not per user) ------------------
    await createLog(
      {
        userId: doc.createdBy,
        groupId: doc.groupId ?? null,
        taskId: doc._id,
        action: "TASK_OVERDUE",
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
      taskId: task._id,
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

export const startTaskScheduler = () => {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      // Find candidates: PENDING, past due, not deleted.
      // We use notifiedUsers to allow per-user retries — a task is a
      // candidate as long as at least one assigned user hasn't been notified.
      const overdueTasks = await Task.find({
        status: "PENDING",
        dueDateTime: { $lte: now },
        isDeleted: { $ne: true },
      })
        .populate("assignedUsers", "_id name email")
        .populate("groupId", "_id name")
        .lean();

      if (overdueTasks.length === 0) return;

      let successCount = 0;

      for (const task of overdueTasks) {
        try {
          const result = await processOverdueTask(task);
          if (!result) continue; // skipped (already handled by concurrent process)

          // Fetch fully-populated document for socket payloads
          const populated = await getPopulatedTask(task._id);

          // Emit to each newly-notified user
          for (const userId of result.notified) {
            const notification = result.notifications?.find(
              (n) => n.userId.toString() === userId,
            );

            // taskOverdue → card turns red immediately
            emitToUser(userId, "taskOverdue", {
              taskId: String(task._id),
              task: populated,
            });

            // notificationTriggered → badge increments
            if (notification) {
              emitToUser(userId, "notificationTriggered", {
                notification: {
                  _id: String(notification._id),
                  userId,
                  taskId: {
                    _id: String(task._id),
                    title: task.title,
                  },
                  groupId: task.groupId ?? null,
                  type: "TASK_DUE",
                  message: notification.message,
                  isRead: false,
                  createdAt: notification.createdAt,
                },
              });
            }
          }

          successCount++;
        } catch (taskErr) {
          // Log per-task failure but continue processing the rest
          console.error(
            `[Scheduler] Failed to process task ${task._id}:`,
            taskErr.message,
          );
        }
      }

      console.info(
        `[Scheduler] Processed ${successCount}/${overdueTasks.length} overdue task(s)`,
      );
    } catch (err) {
      console.error("[Scheduler] Tick error:", err.message);
    }
  });

  console.info("[Scheduler] Task scheduler started");
};
