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
 *   8. Sub-reminders are the parent reminder's execution plan. Only the parent's
 *      creator owns that plan: createSubReminder/deleteSubReminder are
 *      creator-only. Assigned (non-creator) users execute the plan: they may
 *      view it (getSubReminders) and complete items (completeSubReminder), but
 *      not create or delete them.
 *   9. Any active member of the parent's group may also view the plan
 *      (getSubReminders) for transparency, even if not creator/assigned —
 *      they still cannot create/complete/delete items.
 *  10. AI subtask generation is creator-only, same as manual create. It's a
 *      2-step flow: generateSubtaskSuggestions is pure (LLM call only, no DB
 *      write, no log, no socket emit); createSubRemindersBatch is the only
 *      step that persists anything, in one transaction, once the user
 *      confirms a reviewed (possibly edited) set of suggestions.
 */

import mongoose from "mongoose";
import Reminder from "../models/Reminder.js";
import Group from "../models/Group.js";
import { createLog } from "./activityLogService.js";
import * as geminiService from "./geminiService.js";
import { subReminderFieldsSchema } from "../scehma/subReminderSchema.js";

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

    // 2. Only the parent's creator plans the execution — creating a sub-reminder
    //    is a planning action, so assigned (non-creator) users may not do it.
    const isCreator = parent.createdBy.toString() === creatorId.toString();
    if (!isCreator) {
      throw new Error("Only the reminder creator can add sub-reminders");
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

// ─── Generate subtask suggestions (AI) — pure, no persistence ────────────────
// Creator-only, same planning-action rule as createSubReminder. Never writes
// to the DB, never logs, never emits a socket event — generating a draft is
// not a state change, only confirming one (createSubRemindersBatch) is.

export const generateSubtaskSuggestions = async ({
  parentId,
  requestingUserId,
}) => {
  const parent = await Reminder.findById(parentId).lean();

  if (!parent) throw new Error("Parent reminder not found");
  if (parent.isDeleted) throw new Error("Parent reminder has been deleted");
  if (parent.parentId) {
    throw new Error(
      "Sub-reminders cannot be nested more than one level deep",
    );
  }
  if (parent.status === "COMPLETED") {
    throw new Error("Cannot add sub-reminders to a completed reminder");
  }

  const isCreator =
    parent.createdBy.toString() === requestingUserId.toString();
  if (!isCreator) {
    throw new Error("Only the reminder creator can generate sub-reminders");
  }

  const rawSuggestions = await geminiService.generateSubtasks({
    reminder: {
      title: parent.title,
      description: parent.description,
      priority: parent.priority,
      dueDateTime: parent.dueDateTime,
    },
  });

  // Turn each raw dueOffsetDays into a real date and re-validate every field —
  // never trust raw LLM output. Anything invalid is dropped, not surfaced.
  const now = new Date();
  const parentDue = new Date(parent.dueDateTime);

  const suggestions = [];
  for (const item of rawSuggestions) {
    const offsetDays = Number.isFinite(item?.dueOffsetDays)
      ? Math.max(0, Math.trunc(item.dueOffsetDays))
      : 1;

    let due = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    // Clamp to just before the parent's own due date, when the parent isn't
    // already overdue — a subtask shouldn't be due after the task itself.
    if (parentDue > now && due >= parentDue) {
      due = new Date(parentDue.getTime() - 60 * 60 * 1000);
    }
    // Floor: dueDateTime must be strictly in the future.
    if (due <= now) {
      due = new Date(now.getTime() + 60 * 60 * 1000);
    }

    const parsed = subReminderFieldsSchema.safeParse({
      title: item?.title,
      description: item?.description ?? "",
      dueDateTime: due,
      priority: item?.priority,
    });
    if (parsed.success) suggestions.push(parsed.data);
  }

  if (suggestions.length === 0) {
    throw new Error("Failed to generate subtasks — please try again");
  }

  return suggestions;
};

// ─── Create multiple sub-reminders in one transaction (AI-review confirm) ────
// Same creator-only + parent guards as createSubReminder, extended to a
// single multi-insert transaction so a partial failure can't leave some of
// the reviewed batch persisted and some not.

export const createSubRemindersBatch = async (
  { parentId, subReminders, creatorId },
  ipAddress,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const parent = await Reminder.findById(parentId).session(session);

    if (!parent) throw new Error("Parent reminder not found");
    if (parent.isDeleted) throw new Error("Parent reminder has been deleted");
    if (parent.parentId) {
      throw new Error(
        "Sub-reminders cannot be nested more than one level deep",
      );
    }
    if (parent.status === "COMPLETED") {
      throw new Error("Cannot add sub-reminders to a completed reminder");
    }

    const isCreator = parent.createdBy.toString() === creatorId.toString();
    if (!isCreator) {
      throw new Error("Only the reminder creator can add sub-reminders");
    }

    const docs = subReminders.map((item) => ({
      parentId: parent._id,
      title: item.title,
      description: item.description ?? "",
      dueDateTime: item.dueDateTime,
      priority: item.priority ?? parent.priority,
      groupId: parent.groupId ?? null,
      createdBy: creatorId,
      assignedUsers: parent.assignedUsers, // inherit from parent
      recurrence: "NONE", // sub-reminders don't recur
      userCompletions: [],
    }));

    const created = await Reminder.create(docs, { session, ordered: true });

    await createLog(
      {
        userId: creatorId,
        groupId: parent.groupId ?? null,
        reminderId: parent._id,
        action: "SUBREMINDER_CREATED",
        metadata: {
          count: created.length,
          subReminderIds: created.map((d) => d._id),
          source: "ai",
        },
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();

    const createdIds = created.map((d) => d._id);
    return populateSubReminder(
      Reminder.find({ _id: { $in: createdIds } }),
    ).lean();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// ─── Get sub-reminders for a parent ──────────────────────────────────────────

export const getSubReminders = async ({ parentId, requestingUserId }) => {
  // Validate access — creator, assigned, or any active member of the parent's group
  const parent = await Reminder.findById(parentId).lean();

  if (!parent) throw new Error("Parent reminder not found");
  if (parent.isDeleted) throw new Error("Parent reminder has been deleted");

  const isCreator = parent.createdBy.toString() === requestingUserId.toString();
  const isAssigned = parent.assignedUsers.some(
    (uid) => uid.toString() === requestingUserId.toString(),
  );

  let isGroupMember = false;
  if (!isCreator && !isAssigned && parent.groupId) {
    const group = await Group.findOne({
      _id: parent.groupId,
      isActive: true,
      "members.userId": requestingUserId,
    });
    isGroupMember = !!group;
  }

  if (!isCreator && !isAssigned && !isGroupMember)
    throw new Error("Access denied");

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
    // 1. Validate parent exists and requester owns the plan
    const parent = await Reminder.findById(parentId).session(session);
    if (!parent) throw new Error("Parent reminder not found");
    if (parent.isDeleted) throw new Error("Parent reminder has been deleted");

    // Deleting a sub-reminder is a planning action — creator-only, same as create.
    const isCreator =
      parent.createdBy.toString() === requestingUserId.toString();
    if (!isCreator) {
      throw new Error("Only the reminder creator can delete sub-reminders");
    }

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
    // createdBy/assignedUsers returned (not part of the HTTP response body —
    // the controller only forwards `message`) so the caller can target the
    // subReminderDeleted socket event at the relevant users instead of
    // broadcasting it to everyone.
    return {
      message: "Sub-reminder deleted successfully",
      createdBy: sub.createdBy,
      assignedUsers: sub.assignedUsers,
    };
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
