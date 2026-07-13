/**
 * controllers/taskController.js
 *
 * Thin controller layer — validates input, calls service, sends response.
 * Consistent response format via apiResponse helpers; targeted per-user
 * socket events (io.to(userId).emit(...)); next(error) for error handling.
 */

import * as taskService from "../services/taskService.js";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendForbidden,
  sendBadRequest,
} from "../utils/apiResponse.js";

const getIp = (req) => req.ip || req.headers["x-forwarded-for"] || null;

// ── Helper: emit to every assigned user's personal room ───────────────────────
const emitToAssigned = (io, event, task, extraData = {}) => {
  if (!io || !task?.assignedUsers) return;
  const uids = new Set();
  // Always also notify the creator
  if (task.createdBy) {
    const creatorId = task.createdBy._id ?? task.createdBy;
    uids.add(String(creatorId));
  }
  for (const uid of task.assignedUsers) {
    uids.add(String(uid._id ?? uid));
  }
  for (const uid of uids) {
    io.to(uid).emit(event, { task, ...extraData });
  }
};

export const createTask = async (req, res, next) => {
  try {
    const task = await taskService.createTask(
      { ...req.body, creatorId: req.user._id },
      getIp(req),
    );

    // Emit to all assigned users
    emitToAssigned(req.app.get("io"), "taskCreated", task);

    return sendCreated(res, task, "Task created");
  } catch (error) {
    next(error);
  }
};

export const getMyTasks = async (req, res, next) => {
  try {
    const { status, priority, page, limit } = req.query;
    const result = await taskService.getMyTasks({
      userId: req.user._id,
      status,
      priority,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    return sendSuccess(res, result, "Tasks retrieved");
  } catch (error) {
    next(error);
  }
};

export const getGroupTasks = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await taskService.getGroupTasks({
      groupId: req.params.groupId,
      requestingUserId: req.user._id,
      status,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    return sendSuccess(res, result, "Group tasks retrieved");
  } catch (error) {
    next(error);
  }
};

export const getTaskById = async (req, res, next) => {
  try {
    const task = await taskService.getTaskById({
      taskId: req.params.id,
      requestingUserId: req.user._id,
    });
    return sendSuccess(res, task, "Task retrieved");
  } catch (error) {
    next(error);
  }
};

export const updateTask = async (req, res, next) => {
  try {
    const task = await taskService.updateTask({
      taskId: req.params.id,
      requestingUserId: req.user._id,
      updates: req.body,
      ipAddress: getIp(req),
    });

    emitToAssigned(req.app.get("io"), "taskUpdated", task);

    return sendSuccess(res, task, "Task updated");
  } catch (error) {
    next(error);
  }
};

export const completeTask = async (req, res, next) => {
  try {
    const task = await taskService.completeTask({
      taskId: req.params.id,
      requestingUserId: req.user._id,
      ipAddress: getIp(req),
    });

    const io = req.app.get("io");
    if (io && task?.assignedUsers) {
      const uids = new Set([
        String(task.createdBy._id ?? task.createdBy),
        ...task.assignedUsers.map((u) => String(u._id ?? u)),
      ]);
      for (const uid of uids) {
        io.to(uid).emit("taskCompleted", {
          taskId: task._id,
          task,
        });
      }
    }

    return sendSuccess(res, task, "Task marked as complete");
  } catch (error) {
    next(error);
  }
};

export const deleteTask = async (req, res, next) => {
  try {
    const result = await taskService.deleteTask({
      taskId: req.params.id,
      requestingUserId: req.user._id,
      ipAddress: getIp(req),
    });
    return sendSuccess(res, null, result.message || "Task deleted");
  } catch (error) {
    next(error);
  }
};
