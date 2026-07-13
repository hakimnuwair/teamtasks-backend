/**
 * services/subTaskService.js
 *
 * All sub-task business logic.
 *
 * Design rules:
 *   1. Sub-tasks are exactly 1 level deep.
 *      A sub-task cannot itself become a parent (enforced in createSubTask).
 *   2. Sub-tasks inherit groupId and assignedUsers from parent.
 *      The creator does not re-specify these — it keeps the UI simple.
 *   3. Parent completion is blocked if any PENDING or OVERDUE sub-task exists.
 *      This check lives in taskService.completeTask (patched there).
 *   4. Deleting a parent soft-deletes all its sub-tasks in the same transaction.
 *      This is handled in taskService.deleteTask (patched there).
 *   5. Sub-tasks use the same soft-delete pattern as top-level tasks.
 *   6. Sub-tasks do NOT trigger TASK_ASSIGNED notifications
 *      (parent already notified assignees; sub-tasks are granular breakdowns).
 *   7. Sub-tasks DO participate in the scheduler — if their dueDateTime
 *      passes, they go OVERDUE independently.
 *   8. Sub-tasks are the parent task's execution plan. Only the parent's
 *      creator owns that plan: createSubTask/deleteSubTask are
 *      creator-only. Assigned (non-creator) users execute the plan: they may
 *      view it (getSubTasks) and complete items (completeSubTask), but
 *      not create or delete them.
 *   9. Any active member of the parent's group may also view the plan
 *      (getSubTasks) for transparency, even if not creator/assigned —
 *      they still cannot create/complete/delete items.
 *  10. AI sub-task generation is creator-only, same as manual create. It's a
 *      2-step flow: generateSubTaskSuggestions is pure (LLM call only, no DB
 *      write, no log, no socket emit); createSubTasksBatch is the only
 *      step that persists anything, in one transaction, once the user
 *      confirms a reviewed (possibly edited) set of suggestions.
 */

import mongoose from "mongoose";
import Task from "../models/Task.js";
import Group from "../models/Group.js";
import { createLog } from "./activityLogService.js";
import * as geminiService from "./geminiService.js";
import { subTaskFieldsSchema } from "../scehma/subTaskSchema.js";

// ── Populate shape reused across all queries ──────────────────────────────────
const populateSubTask = (query) =>
  query
    .populate("createdBy", "name email")
    .populate("assignedUsers", "name email")
    .populate("groupId", "name");

// ─── Create sub-task ─────────────────────────────────────────────────────────

export const createSubTask = async (
  { parentId, title, description, dueDateTime, priority, creatorId },
  ipAddress,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Load and validate the parent task
    const parent = await Task.findById(parentId).session(session);

    if (!parent) throw new Error("Parent task not found");
    if (parent.isDeleted) throw new Error("Parent task has been deleted");
    if (parent.parentId) {
      // The parent is itself a sub-task — reject nesting deeper than 1
      throw new Error("Sub-tasks cannot be nested more than one level deep");
    }
    if (parent.status === "COMPLETED") {
      throw new Error("Cannot add sub-tasks to a completed task");
    }

    // 2. Only the parent's creator plans the execution — creating a sub-task
    //    is a planning action, so assigned (non-creator) users may not do it.
    const isCreator = parent.createdBy.toString() === creatorId.toString();
    if (!isCreator) {
      throw new Error("Only the task creator can add sub-tasks");
    }

    // 3. Create the sub-task — inherit group context from parent
    const [subTask] = await Task.create(
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
          recurrence: "NONE", // sub-tasks don't recur
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
        taskId: parent._id, // log against the parent
        action: "SUBTASK_CREATED",
        metadata: { title, subTaskId: subTask._id },
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();

    // Return fully populated sub-task
    return populateSubTask(Task.findById(subTask._id)).lean();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// ─── Generate sub-task suggestions (AI) — pure, no persistence ───────────────
// Creator-only, same planning-action rule as createSubTask. Never writes
// to the DB, never logs, never emits a socket event — generating a draft is
// not a state change, only confirming one (createSubTasksBatch) is.

export const generateSubTaskSuggestions = async ({
  parentId,
  requestingUserId,
}) => {
  const parent = await Task.findById(parentId).lean();

  if (!parent) throw new Error("Parent task not found");
  if (parent.isDeleted) throw new Error("Parent task has been deleted");
  if (parent.parentId) {
    throw new Error("Sub-tasks cannot be nested more than one level deep");
  }
  if (parent.status === "COMPLETED") {
    throw new Error("Cannot add sub-tasks to a completed task");
  }

  const isCreator =
    parent.createdBy.toString() === requestingUserId.toString();
  if (!isCreator) {
    throw new Error("Only the task creator can generate sub-tasks");
  }

  const rawSuggestions = await geminiService.generateSubTasks({
    task: {
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
    // already overdue — a sub-task shouldn't be due after the task itself.
    if (parentDue > now && due >= parentDue) {
      due = new Date(parentDue.getTime() - 60 * 60 * 1000);
    }
    // Floor: dueDateTime must be strictly in the future.
    if (due <= now) {
      due = new Date(now.getTime() + 60 * 60 * 1000);
    }

    const parsed = subTaskFieldsSchema.safeParse({
      title: item?.title,
      description: item?.description ?? "",
      dueDateTime: due,
      priority: item?.priority,
    });
    if (parsed.success) suggestions.push(parsed.data);
  }

  if (suggestions.length === 0) {
    throw new Error("Failed to generate sub-tasks — please try again");
  }

  return suggestions;
};

// ─── Create multiple sub-tasks in one transaction (AI-review confirm) ───────
// Same creator-only + parent guards as createSubTask, extended to a
// single multi-insert transaction so a partial failure can't leave some of
// the reviewed batch persisted and some not.

export const createSubTasksBatch = async (
  { parentId, subTasks, creatorId },
  ipAddress,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const parent = await Task.findById(parentId).session(session);

    if (!parent) throw new Error("Parent task not found");
    if (parent.isDeleted) throw new Error("Parent task has been deleted");
    if (parent.parentId) {
      throw new Error("Sub-tasks cannot be nested more than one level deep");
    }
    if (parent.status === "COMPLETED") {
      throw new Error("Cannot add sub-tasks to a completed task");
    }

    const isCreator = parent.createdBy.toString() === creatorId.toString();
    if (!isCreator) {
      throw new Error("Only the task creator can add sub-tasks");
    }

    const docs = subTasks.map((item) => ({
      parentId: parent._id,
      title: item.title,
      description: item.description ?? "",
      dueDateTime: item.dueDateTime,
      priority: item.priority ?? parent.priority,
      groupId: parent.groupId ?? null,
      createdBy: creatorId,
      assignedUsers: parent.assignedUsers, // inherit from parent
      recurrence: "NONE", // sub-tasks don't recur
      userCompletions: [],
    }));

    const created = await Task.create(docs, { session, ordered: true });

    await createLog(
      {
        userId: creatorId,
        groupId: parent.groupId ?? null,
        taskId: parent._id,
        action: "SUBTASK_CREATED",
        metadata: {
          count: created.length,
          subTaskIds: created.map((d) => d._id),
          source: "ai",
        },
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();

    const createdIds = created.map((d) => d._id);
    return populateSubTask(Task.find({ _id: { $in: createdIds } })).lean();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// ─── Get sub-tasks for a parent ──────────────────────────────────────────────

export const getSubTasks = async ({ parentId, requestingUserId }) => {
  // Validate access — creator, assigned, or any active member of the parent's group
  const parent = await Task.findById(parentId).lean();

  if (!parent) throw new Error("Parent task not found");
  if (parent.isDeleted) throw new Error("Parent task has been deleted");

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

  const subTasks = await populateSubTask(
    Task.find({ parentId }).sort({ dueDateTime: 1 }),
  ).lean();

  return subTasks;
};

// ─── Delete a single sub-task ────────────────────────────────────────────────

export const deleteSubTask = async (
  { parentId, subTaskId, requestingUserId },
  ipAddress,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Validate parent exists and requester owns the plan
    const parent = await Task.findById(parentId).session(session);
    if (!parent) throw new Error("Parent task not found");
    if (parent.isDeleted) throw new Error("Parent task has been deleted");

    // Deleting a sub-task is a planning action — creator-only, same as create.
    const isCreator =
      parent.createdBy.toString() === requestingUserId.toString();
    if (!isCreator) {
      throw new Error("Only the task creator can delete sub-tasks");
    }

    // 2. Load the sub-task and verify it belongs to this parent
    const sub = await Task.findOne({
      _id: subTaskId,
      parentId: parentId,
    }).session(session);

    if (!sub) throw new Error("Sub-task not found");
    if (sub.isDeleted) throw new Error("Sub-task is already deleted");

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
        taskId: parent._id,
        action: "SUBTASK_DELETED",
        metadata: { title: sub.title, subTaskId: sub._id },
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();
    // createdBy/assignedUsers returned (not part of the HTTP response body —
    // the controller only forwards `message`) so the caller can target the
    // subTaskDeleted socket event at the relevant users instead of
    // broadcasting it to everyone.
    return {
      message: "Sub-task deleted successfully",
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

// ─── Complete a sub-task ─────────────────────────────────────────────────────

export const completeSubTask = async (
  { parentId, subTaskId, requestingUserId },
  ipAddress,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate parent access
    const parent = await Task.findById(parentId).session(session);
    if (!parent) throw new Error("Parent task not found");
    if (parent.isDeleted) throw new Error("Parent task has been deleted");

    // Load sub-task
    const sub = await Task.findOne({
      _id: subTaskId,
      parentId: parentId,
    }).session(session);

    if (!sub) throw new Error("Sub-task not found");
    if (sub.isDeleted) throw new Error("Sub-task has been deleted");
    if (sub.status === "COMPLETED")
      throw new Error("Sub-task is already completed");

    // Only assigned users can complete a sub-task (mirrors
    // taskService.completeTask's rule) — the creator only qualifies here
    // when they're also an assignee, same as top-level tasks.
    const isAssigned = sub.assignedUsers.some(
      (uid) => uid.toString() === requestingUserId.toString(),
    );
    if (!isAssigned)
      throw new Error("Only assigned users can complete this sub-task");

    // Check per-user completion (mirrors taskService.completeTask logic)
    const alreadyDone = sub.userCompletions.some(
      (uc) => uc.userId.toString() === requestingUserId.toString(),
    );
    if (alreadyDone)
      throw new Error("You have already completed this sub-task");

    sub.userCompletions.push({
      userId: requestingUserId,
      completedAt: new Date(),
    });

    // For personal sub-tasks — complete immediately
    // For group sub-tasks — complete when ALL assigned users complete
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

    return populateSubTask(Task.findById(sub._id)).lean();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// ─── Internal helper: soft-delete ALL sub-tasks for a parent ────────────────
// Called by taskService.deleteTask — must be passed an active session.

export const softDeleteAllSubTasks = async (parentId, deletedBy, session) => {
  await Task.updateMany(
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

// ─── Internal helper: check if parent has blocking sub-tasks ────────────────
// Called by taskService.completeTask before marking parent complete.
// Returns true if ANY sub-task is still PENDING or OVERDUE.

export const hasBlockingSubTasks = async (parentId) => {
  const count = await Task.countDocuments({
    parentId,
    status: { $in: ["PENDING", "OVERDUE"] },
    isDeleted: false,
  });
  return count > 0;
};
