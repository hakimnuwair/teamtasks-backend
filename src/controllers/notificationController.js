/**
 * controllers/notificationController.js — COMPLETE REPLACEMENT
 * Place at: controllers/notificationController.js
 */

import * as notificationService from "../services/notificationService.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

export const getNotifications = async (req, res, next) => {
  try {
    const { page, limit, unreadOnly } = req.query;
    const result = await notificationService.getUserNotifications({
      userId: req.user._id,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      unreadOnly: unreadOnly === "true",
    });
    return sendSuccess(res, result, "Notifications retrieved");
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req, res, next) => {
  try {
    const result = await notificationService.markAsRead({
      userId: req.user._id,
      notificationIds: req.body.notificationIds,
    });
    return sendSuccess(res, result, "Notifications marked as read");
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (req, res, next) => {
  try {
    const result = await notificationService.markAllAsRead(req.user._id);
    return sendSuccess(res, result, "All notifications marked as read");
  } catch (error) {
    next(error);
  }
};

export const deleteNotification = async (req, res, next) => {
  try {
    await notificationService.deleteNotification({
      userId: req.user._id,
      notificationId: req.params.id,
    });
    return sendSuccess(res, null, "Notification deleted");
  } catch (error) {
    next(error);
  }
};
