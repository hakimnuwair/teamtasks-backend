/**
 * services/subReminderService.js
 *
 * All sub-reminder business logic.
 *
 * Design rules:
 *   1. Sub-reminders are exactly 1 level deep.
 *      A sub-reminder cannot itself become a parent (enforced in createSubReminder).
 *   2. Sub-reminders inherit groupId and assignedUsers from parent.
 *      The creator does not re-specify these — it keeps the UI simple.
 *   3. Parent completion is blocked if any PENDING or OVERDUE sub-reminder exists.
 *      This check lives in reminderService.completeReminder (patched there).
 *   4. Deleting a parent soft-deletes all its sub-reminders in the same transaction.
 *      This is handled in reminderService.deleteReminder (patched there).
 *   5. Sub-reminders use the same soft-delete pattern as top-level reminders.
 *   6. Sub-reminders do NOT trigger REMINDER_ASSIGNED notifications
 *      (parent already notified assignees; sub-tasks are granular breakdowns).
 *   7. Sub-reminders DO participate in the scheduler — if their dueDateTime
 *      passes, they go OVERDUE independently.
 */

import mongoose from "mongoose";
import Reminder from "../models/Reminder.js";
import { createLog } from "./activityLogService.js";

// ── Populate shape reused across all queries ──────────────────────────────────
const populateSubReminder = (query) =>
  query
    .populate("createdBy", "name email")
    .populate("assignedUsers", "name email")
    .populate("groupId", "name");

// ─── Create sub-reminder ─────────────────────────────────────────────────────

export const createSubReminder = async (
  { parentId, title, description, dueDateTime, priority, creatorId },
  ipAddress,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Load and validate the parent reminder
    const parent = await Reminder.findById(parentId).session(session);

    if (!parent) throw new Error("Parent reminder not found");
    if (parent.isDeleted) throw new Error("Parent reminder has been deleted");
    if (parent.parentId) {
      // The parent is itself a sub-reminder — reject nesting deeper than 1
      throw new Error(
        "Sub-reminders cannot be nested more than one level deep",
      );
    }
    if (parent.status === "COMPLETED") {
      throw new Error("Cannot add sub-reminders to a completed reminder");
    }

    // 2. Only the parent's creator or an assigned user may add sub-reminders
    const isCreator = parent.createdBy.toString() === creatorId.toString();
    const isAssigned = parent.assignedUsers.some(
      (uid) => uid.toString() === creatorId.toString(),
    );
    if (!isCreator && !isAssigned) {
      throw new Error("You do not have access to this reminder");
    }

    // 3. Create the sub-reminder — inherit group context from parent
    const [subReminder] = await Reminder.create(
      [
        {
          parentId: parent._id,
          title,
          description: description ?? "",
          dueDateTime,
          priority: priority ?? parent.priority,
          groupId: parent.groupId ?? null,
          createdBy: creatorId,
          assignedUsers: parent.assignedUsers, // inherit from parent
          recurrence: "NONE", // sub-reminders don't recur
          userCompletions: [],
        },
      ],
      { session, ordered: true },
    );

    // 4. Activity log
    await createLog(
      {
        userId: creatorId,
        groupId: parent.groupId ?? null,
        reminderId: parent._id, // log against the parent
        action: "SUBREMINDER_CREATED",
        metadata: { title, subReminderId: subReminder._id },
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();

    // Return fully populated sub-reminder
    return populateSubReminder(Reminder.findById(subReminder._id)).lean();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// ─── Get sub-reminders for a parent ──────────────────────────────────────────

export const getSubReminders = async ({ parentId, requestingUserId }) => {
  // Validate access — the requester must be creator or assigned on the parent
  const parent = await Reminder.findById(parentId).lean();

  if (!parent) throw new Error("Parent reminder not found");
  if (parent.isDeleted) throw new Error("Parent reminder has been deleted");

  const isCreator = parent.createdBy.toString() === requestingUserId.toString();
  const isAssigned = parent.assignedUsers.some(
    (uid) => uid.toString() === requestingUserId.toString(),
  );
  if (!isCreator && !isAssigned) throw new Error("Access denied");

  const subReminders = await populateSubReminder(
    Reminder.find({ parentId }).sort({ dueDateTime: 1 }),
  ).lean();

  return subReminders;
};

// ─── Delete a single sub-reminder ────────────────────────────────────────────

export const deleteSubReminder = async (
  { parentId, subReminderId, requestingUserId },
  ipAddress,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Validate parent exists and requester has access
    const parent = await Reminder.findById(parentId).session(session);
    if (!parent) throw new Error("Parent reminder not found");
    if (parent.isDeleted) throw new Error("Parent reminder has been deleted");

    const isCreator =
      parent.createdBy.toString() === requestingUserId.toString();
    const isAssigned = parent.assignedUsers.some(
      (uid) => uid.toString() === requestingUserId.toString(),
    );
    if (!isCreator && !isAssigned) throw new Error("Access denied");

    // 2. Load the sub-reminder and verify it belongs to this parent
    const sub = await Reminder.findOne({
      _id: subReminderId,
      parentId: parentId,
    }).session(session);

    if (!sub) throw new Error("Sub-reminder not found");
    if (sub.isDeleted) throw new Error("Sub-reminder is already deleted");

    // 3. Soft-delete
    sub.isDeleted = true;
    sub.deletedAt = new Date();
    sub.deletedBy = requestingUserId;
    await sub.save({ session });

    // 4. Activity log
    await createLog(
      {
        userId: requestingUserId,
        groupId: parent.groupId ?? null,
        reminderId: parent._id,
        action: "SUBREMINDER_DELETED",
        metadata: { title: sub.title, subReminderId: sub._id },
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();
    return { message: "Sub-reminder deleted successfully" };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// ─── Complete a sub-reminder ──────────────────────────────────────────────────

export const completeSubReminder = async (
  { parentId, subReminderId, requestingUserId },
  ipAddress,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate parent access
    const parent = await Reminder.findById(parentId).session(session);
    if (!parent) throw new Error("Parent reminder not found");
    if (parent.isDeleted) throw new Error("Parent reminder has been deleted");

    const isCreator =
      parent.createdBy.toString() === requestingUserId.toString();
    const isAssigned = parent.assignedUsers.some(
      (uid) => uid.toString() === requestingUserId.toString(),
    );
    if (!isCreator && !isAssigned) throw new Error("Access denied");

    // Load sub-reminder
    const sub = await Reminder.findOne({
      _id: subReminderId,
      parentId: parentId,
    }).session(session);

    if (!sub) throw new Error("Sub-reminder not found");
    if (sub.isDeleted) throw new Error("Sub-reminder has been deleted");
    if (sub.status === "COMPLETED")
      throw new Error("Sub-reminder is already completed");

    // Check per-user completion (mirrors reminderService.completeReminder logic)
    const alreadyDone = sub.userCompletions.some(
      (uc) => uc.userId.toString() === requestingUserId.toString(),
    );
    if (alreadyDone)
      throw new Error("You have already completed this sub-reminder");

    sub.userCompletions.push({
      userId: requestingUserId,
      completedAt: new Date(),
    });

    // For personal sub-reminders — complete immediately
    // For group sub-reminders — complete when ALL assigned users complete
    if (!sub.groupId) {
      sub.status = "COMPLETED";
      sub.completedAt = new Date();
    } else {
      const completedIds = new Set(
        sub.userCompletions.map((uc) => uc.userId.toString()),
      );
      const allDone = sub.assignedUsers.every((uid) =>
        completedIds.has(uid.toString()),
      );
      if (allDone) {
        sub.status = "COMPLETED";
        sub.completedAt = new Date();
      }
    }

    await sub.save({ session });
    await session.commitTransaction();

    return populateSubReminder(Reminder.findById(sub._id)).lean();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// ─── Internal helper: soft-delete ALL sub-reminders for a parent ──────────────
// Called by reminderService.deleteReminder — must be passed an active session.

export const softDeleteAllSubReminders = async (
  parentId,
  deletedBy,
  session,
) => {
  await Reminder.updateMany(
    { parentId, isDeleted: false },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy,
      },
    },
    { session },
  );
};

// ─── Internal helper: check if parent has blocking sub-reminders ──────────────
// Called by reminderService.completeReminder before marking parent complete.
// Returns true if ANY sub-reminder is still PENDING or OVERDUE.

export const hasBlockingSubReminders = async (parentId) => {
  const count = await Reminder.countDocuments({
    parentId,
    status: { $in: ["PENDING", "OVERDUE"] },
    isDeleted: false,
  });
  return count > 0;
};
