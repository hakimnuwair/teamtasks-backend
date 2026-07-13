/**
 * services/taskService.js
 *
 * All top-level task business logic.
 */

import mongoose from "mongoose";
import Task from "../models/Task.js";
import Group from "../models/Group.js";
import Notification from "../models/Notification.js";
import { createLog } from "./activityLogService.js";

// Import the two helpers we need — defined in subTaskService.js
import { softDeleteAllSubTasks, hasBlockingSubTasks } from "./subTaskService.js";

// ─── Helper ────────────────────────────────────────────────────────────────────

const resolveAssignedUsers = async (
  groupId,
  assignedUsers,
  creatorId,
  session,
) => {
  if (!groupId) return [creatorId];
  const group = await Group.findOne({ _id: groupId, isActive: true }).session(
    session,
  );
  if (!group) throw new Error("Group not found");
  const memberIds = group.members.map((m) => m.userId.toString());
  if (assignedUsers && assignedUsers.length > 0) {
    const invalid = assignedUsers.filter(
      (id) => !memberIds.includes(id.toString()),
    );
    if (invalid.length > 0)
      throw new Error("Some users are not members of this group");
    return assignedUsers;
  }
  return group.members.map((m) => m.userId);
};

// ─── createTask ────────────────────────────────────────────────────────────────

export const createTask = async (
  {
    title,
    description,
    dueDateTime,
    recurrence,
    groupId,
    assignedUsers,
    priority,
    creatorId,
  },
  ipAddress,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const resolvedUsers = await resolveAssignedUsers(
      groupId,
      assignedUsers,
      creatorId,
      session,
    );

    const [task] = await Task.create(
      [
        {
          title,
          description,
          dueDateTime,
          recurrence,
          groupId: groupId || null,
          createdBy: creatorId,
          assignedUsers: resolvedUsers,
          priority,
          userCompletions: [],
          parentId: null, // explicit: this is always a top-level task
        },
      ],
      { session, ordered: true },
    );

    const toNotify = resolvedUsers.filter(
      (uid) => uid.toString() !== creatorId.toString(),
    );
    if (toNotify.length > 0) {
      await Notification.create(
        toNotify.map((uid) => ({
          userId: uid,
          taskId: task._id,
          groupId: groupId || null,
          type: "TASK_ASSIGNED",
          message: `You have been assigned a task: "${title}"`,
        })),
        { session, ordered: true },
      );
    }

    await createLog(
      {
        userId: creatorId,
        groupId: groupId || null,
        taskId: task._id,
        action: "TASK_CREATED",
        metadata: { title, assignedCount: resolvedUsers.length },
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();
    return task;
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
};

// ─── getMyTasks ──────────────────────────────────────────────────────────────

export const getMyTasks = async ({
  userId,
  status,
  priority,
  page = 1,
  limit = 20,
}) => {
  limit = Math.min(limit, 100); // cap to prevent unbounded pagination requests
  // Only return TOP-LEVEL tasks — sub-tasks are fetched separately
  const filter = { assignedUsers: userId, parentId: null };
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  const skip = (page - 1) * limit;
  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .sort({ dueDateTime: 1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email")
      .populate("assignedUsers", "name email")
      .populate("groupId", "name")
      .lean(),
    Task.countDocuments(filter),
  ]);
  return {
    tasks,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ─── getGroupTasks ───────────────────────────────────────────────────────────

export const getGroupTasks = async ({
  groupId,
  requestingUserId,
  status,
  page = 1,
  limit = 20,
}) => {
  limit = Math.min(limit, 100); // cap to prevent unbounded pagination requests
  const group = await Group.findOne({
    _id: groupId,
    isActive: true,
    "members.userId": requestingUserId,
  });
  if (!group) throw new Error("Group not found or access denied");
  // Only return TOP-LEVEL tasks
  const filter = { groupId, parentId: null };
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .sort({ dueDateTime: 1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email")
      .populate("assignedUsers", "name email")
      .populate("groupId", "name")
      .lean(),
    Task.countDocuments(filter),
  ]);
  return {
    tasks,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ─── getTaskById ─────────────────────────────────────────────────────────────

export const getTaskById = async ({ taskId, requestingUserId }) => {
  const task = await Task.findById(taskId)
    .populate("createdBy", "name email")
    .populate("assignedUsers", "name email")
    .populate("groupId", "name")
    .lean();
  if (!task) throw new Error("Task not found");
  const isAssigned = task.assignedUsers.some(
    (u) => u._id.toString() === requestingUserId.toString(),
  );
  const isCreator =
    task.createdBy._id.toString() === requestingUserId.toString();

  // Any active member of the task's group gets read access, even if
  // they're not the creator/assignee — improves transparency within a group.
  let isGroupMember = false;
  if (!isAssigned && !isCreator && task.groupId) {
    const group = await Group.findOne({
      _id: task.groupId._id ?? task.groupId,
      isActive: true,
      "members.userId": requestingUserId,
    });
    isGroupMember = !!group;
  }

  if (!isAssigned && !isCreator && !isGroupMember)
    throw new Error("Access denied");
  return task;
};

// ─── updateTask ──────────────────────────────────────────────────────────────

export const updateTask = async ({
  taskId,
  requestingUserId,
  updates,
  ipAddress,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const task = await Task.findById(taskId).session(session);
    if (!task) throw new Error("Task not found");
    if (task.createdBy.toString() !== requestingUserId.toString())
      throw new Error("Only the creator can update this task");
    if (task.status === "COMPLETED")
      throw new Error("Cannot update a completed task");
    // Completion must always go through completeTask() so the
    // sub-task-blocking check and per-user completion tracking are enforced.
    if (updates.status === "COMPLETED")
      throw new Error(
        "Invalid update: use POST /tasks/:id/complete to mark a task complete",
      );
    if (updates.assignedUsers && task.groupId) {
      updates.assignedUsers = await resolveAssignedUsers(
        task.groupId,
        updates.assignedUsers,
        requestingUserId,
        session,
      );
    }
    Object.assign(task, updates);
    await task.save({ session });
    await createLog(
      {
        userId: requestingUserId,
        groupId: task.groupId || null,
        taskId: task._id,
        action: "TASK_UPDATED",
        metadata: updates,
        ipAddress,
      },
      session,
    );
    await session.commitTransaction();
    return task;
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
};

// ─── completeTask ────────────────────────────────────────────────────────────
// Blocked if the task has any PENDING or OVERDUE sub-tasks.

export const completeTask = async ({ taskId, requestingUserId, ipAddress }) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const task = await Task.findById(taskId).session(session);
    if (!task) throw new Error("Task not found");

    const isAssigned = task.assignedUsers.some(
      (uid) => uid.toString() === requestingUserId.toString(),
    );
    const isCreator =
      task.createdBy.toString() === requestingUserId.toString();
    if (!isAssigned && !isCreator)
      throw new Error("You are not authorized to complete this task");

    const alreadyDone = task.userCompletions.some(
      (uc) => uc.userId.toString() === requestingUserId.toString(),
    );
    if (alreadyDone) throw new Error("You have already completed this task");

    // Block completion if there are unfinished sub-tasks.
    // Check outside the session (read-only, no need for transaction overhead)
    const isBlocked = await hasBlockingSubTasks(taskId);
    if (isBlocked) {
      throw new Error(
        "Complete or delete all sub-tasks before marking this task complete",
      );
    }

    task.userCompletions.push({
      userId: requestingUserId,
      completedAt: new Date(),
    });

    if (!task.groupId) {
      task.status = "COMPLETED";
      task.completedAt = new Date();
    } else {
      const completedIds = new Set(
        task.userCompletions.map((uc) => uc.userId.toString()),
      );
      if (task.assignedUsers.every((uid) => completedIds.has(uid.toString()))) {
        task.status = "COMPLETED";
        task.completedAt = new Date();
      }
    }

    await task.save({ session });
    await createLog(
      {
        userId: requestingUserId,
        groupId: task.groupId || null,
        taskId: task._id,
        action: "TASK_COMPLETED",
        ipAddress,
      },
      session,
    );
    await session.commitTransaction();

    return Task.findById(task._id)
      .populate("createdBy", "name email")
      .populate("assignedUsers", "name email")
      .populate("userCompletions.userId", "name email")
      .populate("groupId", "name")
      .lean();
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
};

// ─── deleteTask ──────────────────────────────────────────────────────────────
// Also soft-deletes all sub-tasks in the same transaction.

export const deleteTask = async ({ taskId, requestingUserId, ipAddress }) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const task = await Task.findById(taskId).session(session);
    if (!task) throw new Error("Task not found");
    if (task.createdBy.toString() !== requestingUserId.toString())
      throw new Error("Only the creator can delete this task");
    if (task.isDeleted) throw new Error("Task is already deleted");

    // Soft-delete the parent
    task.isDeleted = true;
    task.deletedAt = new Date();
    task.deletedBy = requestingUserId;
    await task.save({ session });

    // Cascade soft-delete to all sub-tasks
    await softDeleteAllSubTasks(taskId, requestingUserId, session);

    // Soft-delete related notifications
    await Notification.updateMany(
      { taskId: task._id },
      { $set: { isDeleted: true } },
      { session },
    );

    await createLog(
      {
        userId: requestingUserId,
        groupId: task.groupId || null,
        taskId: task._id,
        action: "TASK_DELETED",
        metadata: { title: task.title },
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();
    return { message: "Task deleted successfully" };
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
};
