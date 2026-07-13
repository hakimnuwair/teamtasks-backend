/**
 * controllers/subReminderController.js
 *
 * Handles HTTP for all sub-reminder endpoints.
 * Follows the exact same pattern as reminderController.js:
 *   - try/catch with next(error) for centralized error handling
 *   - sendSuccess / sendCreated from apiResponse utils
 *   - getIp() helper
 *   - io.to(uid).emit() for real-time events
 */

import * as subReminderService from "../services/subReminderService.js";
import { sendSuccess, sendCreated } from "../utils/apiResponse.js";

const getIp = (req) => req.ip || req.headers["x-forwarded-for"] || null;

// ── Helper: emit socket event to every user in the sub-reminder's assigned list
const emitSubReminderEvent = (io, event, parentId, subReminder) => {
  if (!io || !subReminder?.assignedUsers) return;
  const uids = new Set();
  if (subReminder.createdBy) {
    uids.add(String(subReminder.createdBy._id ?? subReminder.createdBy));
  }
  for (const uid of subReminder.assignedUsers) {
    uids.add(String(uid._id ?? uid));
  }
  for (const uid of uids) {
    io.to(uid).emit(event, { parentId: String(parentId), subReminder });
  }
};

// ─── POST /reminders/:id/sub-reminders ───────────────────────────────────────

export const createSubReminder = async (req, res, next) => {
  try {
    const subReminder = await subReminderService.createSubReminder(
      {
        parentId: req.params.id,
        ...req.body,
        creatorId: req.user._id,
      },
      getIp(req),
    );

    emitSubReminderEvent(
      req.app.get("io"),
      "subReminderCreated",
      req.params.id,
      subReminder,
    );

    return sendCreated(res, subReminder, "Sub-reminder created");
  } catch (error) {
    next(error);
  }
};

// ─── GET /reminders/:id/sub-reminders ────────────────────────────────────────

export const getSubReminders = async (req, res, next) => {
  try {
    const subReminders = await subReminderService.getSubReminders({
      parentId: req.params.id,
      requestingUserId: req.user._id,
    });

    return sendSuccess(res, { subReminders }, "Sub-reminders retrieved");
  } catch (error) {
    next(error);
  }
};

// ─── POST /reminders/:id/sub-reminders/:subId/complete ───────────────────────

export const completeSubReminder = async (req, res, next) => {
  try {
    const subReminder = await subReminderService.completeSubReminder(
      {
        parentId: req.params.id,
        subReminderId: req.params.subId,
        requestingUserId: req.user._id,
      },
      getIp(req),
    );

    emitSubReminderEvent(
      req.app.get("io"),
      "subReminderCompleted",
      req.params.id,
      subReminder,
    );

    return sendSuccess(res, subReminder, "Sub-reminder marked as complete");
  } catch (error) {
    next(error);
  }
};

// ─── POST /reminders/:id/sub-reminders/generate ──────────────────────────────
// Pure — calls Gemini and returns suggestions. Writes nothing to the DB.

export const generateSubtasks = async (req, res, next) => {
  try {
    const suggestions = await subReminderService.generateSubtaskSuggestions({
      parentId: req.params.id,
      requestingUserId: req.user._id,
    });

    return sendSuccess(res, { suggestions }, "Subtasks generated");
  } catch (error) {
    next(error);
  }
};

// ─── POST /reminders/:id/sub-reminders/batch ─────────────────────────────────
// The only step that persists anything from the AI-review flow — a reviewed
// (possibly edited) set of suggestions, created in one transaction.

export const createSubRemindersBatch = async (req, res, next) => {
  try {
    const subReminders = await subReminderService.createSubRemindersBatch(
      {
        parentId: req.params.id,
        subReminders: req.body.subReminders,
        creatorId: req.user._id,
      },
      getIp(req),
    );

    const io = req.app.get("io");
    if (io && subReminders.length > 0) {
      const first = subReminders[0];
      const uids = new Set();
      if (first.createdBy) {
        uids.add(String(first.createdBy._id ?? first.createdBy));
      }
      for (const uid of first.assignedUsers ?? []) {
        uids.add(String(uid._id ?? uid));
      }
      for (const uid of uids) {
        io.to(uid).emit("subRemindersBatchCreated", {
          parentId: String(req.params.id),
          subReminders,
        });
      }
    }

    return sendCreated(res, { subReminders }, "Sub-reminders created");
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /reminders/:id/sub-reminders/:subId ──────────────────────────────

export const deleteSubReminder = async (req, res, next) => {
  try {
    const result = await subReminderService.deleteSubReminder(
      {
        parentId: req.params.id,
        subReminderId: req.params.subId,
        requestingUserId: req.user._id,
      },
      getIp(req),
    );

    const io = req.app.get("io");
    if (io && result.assignedUsers) {
      // Notify only the creator + assigned users, same as the other sub-reminder events
      const uids = new Set();
      if (result.createdBy) uids.add(String(result.createdBy));
      for (const uid of result.assignedUsers) uids.add(String(uid));
      for (const uid of uids) {
        io.to(uid).emit("subReminderDeleted", {
          parentId: String(req.params.id),
          subReminderId: String(req.params.subId),
        });
      }
    }

    return sendSuccess(res, null, result.message);
  } catch (error) {
    next(error);
  }
};
