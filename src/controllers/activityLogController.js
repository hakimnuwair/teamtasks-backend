/**
 * controllers/activityController.js — COMPLETE REPLACEMENT
 * Place at: controllers/activityController.js
 */

import * as activityLogService from "../services/activityLogService.js";
import { sendSuccess } from "../utils/apiResponse.js";

export const getMyActivityLogs = async (req, res, next) => {
  try {
    const result = await activityLogService.getUserLogs({
      userId: req.user._id,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
    });
    return sendSuccess(res, result, "Activity logs retrieved");
  } catch (error) {
    next(error);
  }
};
