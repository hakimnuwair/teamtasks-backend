/**
 * controllers/reminderController.js — COMPLETE REPLACEMENT
 *
 * Changes:
 *  1. Consistent response format via apiResponse helpers
 *  2. io.emit() → io.to(userId).emit() — targeted per-user socket events
 *  3. next(error) instead of inline error handling
 */

import * as reminderService from "../services/reminderService.js";
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
const emitToAssigned = (io, event, reminder, extraData = {}) => {
  if (!io || !reminder?.assignedUsers) return;
  const uids = new Set();
  // Always also notify the creator
  if (reminder.createdBy) {
    const creatorId = reminder.createdBy._id ?? reminder.createdBy;
    uids.add(String(creatorId));
  }
  for (const uid of reminder.assignedUsers) {
    uids.add(String(uid._id ?? uid));
  }
  for (const uid of uids) {
    io.to(uid).emit(event, { reminder, ...extraData });
  }
};

export const createReminder = async (req, res, next) => {
  try {
    const reminder = await reminderService.createReminder(
      { ...req.body, creatorId: req.user._id },
      getIp(req),
    );

    // Emit to all assigned users
    emitToAssigned(req.app.get("io"), "reminderCreated", reminder);

    return sendCreated(res, reminder, "Reminder created");
  } catch (error) {
    next(error);
  }
};

export const getMyReminders = async (req, res, next) => {
  try {
    const { status, priority, page, limit } = req.query;
    const result = await reminderService.getMyReminders({
      userId: req.user._id,
      status,
      priority,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    return sendSuccess(res, result, "Reminders retrieved");
  } catch (error) {
    next(error);
  }
};

export const getGroupReminders = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await reminderService.getGroupReminders({
      groupId: req.params.groupId,
      requestingUserId: req.user._id,
      status,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    return sendSuccess(res, result, "Group reminders retrieved");
  } catch (error) {
    next(error);
  }
};

export const getReminderById = async (req, res, next) => {
  try {
    const reminder = await reminderService.getReminderById({
      reminderId: req.params.id,
      requestingUserId: req.user._id,
    });
    return sendSuccess(res, reminder, "Reminder retrieved");
  } catch (error) {
    next(error);
  }
};

export const updateReminder = async (req, res, next) => {
  try {
    const reminder = await reminderService.updateReminder({
      reminderId: req.params.id,
      requestingUserId: req.user._id,
      updates: req.body,
      ipAddress: getIp(req),
    });

    emitToAssigned(req.app.get("io"), "reminderUpdated", reminder);

    return sendSuccess(res, reminder, "Reminder updated");
  } catch (error) {
    next(error);
  }
};

export const completeReminder = async (req, res, next) => {
  try {
    const reminder = await reminderService.completeReminder({
      reminderId: req.params.id,
      requestingUserId: req.user._id,
      ipAddress: getIp(req),
    });

    const io = req.app.get("io");
    if (io && reminder?.assignedUsers) {
      const uids = new Set([
        String(reminder.createdBy._id ?? reminder.createdBy),
        ...reminder.assignedUsers.map((u) => String(u._id ?? u)),
      ]);
      for (const uid of uids) {
        io.to(uid).emit("reminderCompleted", {
          reminderId: reminder._id,
          reminder,
        });
      }
    }

    return sendSuccess(res, reminder, "Reminder marked as complete");
  } catch (error) {
    next(error);
  }
};

export const deleteReminder = async (req, res, next) => {
  try {
    const result = await reminderService.deleteReminder({
      reminderId: req.params.id,
      requestingUserId: req.user._id,
      ipAddress: getIp(req),
    });
    return sendSuccess(res, null, result.message || "Reminder deleted");
  } catch (error) {
    next(error);
  }
};
