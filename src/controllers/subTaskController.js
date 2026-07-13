/**
 * controllers/subTaskController.js
 *
 * Handles HTTP for all sub-task endpoints.
 * Follows the exact same pattern as taskController.js:
 *   - try/catch with next(error) for centralized error handling
 *   - sendSuccess / sendCreated from apiResponse utils
 *   - getIp() helper
 *   - io.to(uid).emit() for real-time events
 */

import * as subTaskService from "../services/subTaskService.js";
import { sendSuccess, sendCreated } from "../utils/apiResponse.js";

const getIp = (req) => req.ip || req.headers["x-forwarded-for"] || null;

// ── Helper: emit socket event to every user in the sub-task's assigned list
const emitSubTaskEvent = (io, event, parentId, subTask) => {
  if (!io || !subTask?.assignedUsers) return;
  const uids = new Set();
  if (subTask.createdBy) {
    uids.add(String(subTask.createdBy._id ?? subTask.createdBy));
  }
  for (const uid of subTask.assignedUsers) {
    uids.add(String(uid._id ?? uid));
  }
  for (const uid of uids) {
    io.to(uid).emit(event, { parentId: String(parentId), subTask });
  }
};

// ─── POST /tasks/:id/sub-tasks ────────────────────────────────────────────────

export const createSubTask = async (req, res, next) => {
  try {
    const subTask = await subTaskService.createSubTask(
      {
        parentId: req.params.id,
        ...req.body,
        creatorId: req.user._id,
      },
      getIp(req),
    );

    emitSubTaskEvent(req.app.get("io"), "subTaskCreated", req.params.id, subTask);

    return sendCreated(res, subTask, "Sub-task created");
  } catch (error) {
    next(error);
  }
};

// ─── GET /tasks/:id/sub-tasks ─────────────────────────────────────────────────

export const getSubTasks = async (req, res, next) => {
  try {
    const subTasks = await subTaskService.getSubTasks({
      parentId: req.params.id,
      requestingUserId: req.user._id,
    });

    return sendSuccess(res, { subTasks }, "Sub-tasks retrieved");
  } catch (error) {
    next(error);
  }
};

// ─── POST /tasks/:id/sub-tasks/:subId/complete ───────────────────────────────

export const completeSubTask = async (req, res, next) => {
  try {
    const subTask = await subTaskService.completeSubTask(
      {
        parentId: req.params.id,
        subTaskId: req.params.subId,
        requestingUserId: req.user._id,
      },
      getIp(req),
    );

    emitSubTaskEvent(req.app.get("io"), "subTaskCompleted", req.params.id, subTask);

    return sendSuccess(res, subTask, "Sub-task marked as complete");
  } catch (error) {
    next(error);
  }
};

// ─── POST /tasks/:id/sub-tasks/generate ───────────────────────────────────────
// Pure — calls Gemini and returns suggestions. Writes nothing to the DB.

export const generateSubTasks = async (req, res, next) => {
  try {
    const suggestions = await subTaskService.generateSubTaskSuggestions({
      parentId: req.params.id,
      requestingUserId: req.user._id,
    });

    return sendSuccess(res, { suggestions }, "Sub-tasks generated");
  } catch (error) {
    next(error);
  }
};

// ─── POST /tasks/:id/sub-tasks/batch ──────────────────────────────────────────
// The only step that persists anything from the AI-review flow — a reviewed
// (possibly edited) set of suggestions, created in one transaction.

export const createSubTasksBatch = async (req, res, next) => {
  try {
    const subTasks = await subTaskService.createSubTasksBatch(
      {
        parentId: req.params.id,
        subTasks: req.body.subTasks,
        creatorId: req.user._id,
      },
      getIp(req),
    );

    const io = req.app.get("io");
    if (io && subTasks.length > 0) {
      const first = subTasks[0];
      const uids = new Set();
      if (first.createdBy) {
        uids.add(String(first.createdBy._id ?? first.createdBy));
      }
      for (const uid of first.assignedUsers ?? []) {
        uids.add(String(uid._id ?? uid));
      }
      for (const uid of uids) {
        io.to(uid).emit("subTasksBatchCreated", {
          parentId: String(req.params.id),
          subTasks,
        });
      }
    }

    return sendCreated(res, { subTasks }, "Sub-tasks created");
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /tasks/:id/sub-tasks/:subId ──────────────────────────────────────

export const deleteSubTask = async (req, res, next) => {
  try {
    const result = await subTaskService.deleteSubTask(
      {
        parentId: req.params.id,
        subTaskId: req.params.subId,
        requestingUserId: req.user._id,
      },
      getIp(req),
    );

    const io = req.app.get("io");
    if (io && result.assignedUsers) {
      // Notify only the creator + assigned users, same as the other sub-task events
      const uids = new Set();
      if (result.createdBy) uids.add(String(result.createdBy));
      for (const uid of result.assignedUsers) uids.add(String(uid));
      for (const uid of uids) {
        io.to(uid).emit("subTaskDeleted", {
          parentId: String(req.params.id),
          subTaskId: String(req.params.subId),
        });
      }
    }

    return sendSuccess(res, null, result.message);
  } catch (error) {
    next(error);
  }
};
