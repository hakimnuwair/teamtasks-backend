/**
 * controllers/groupController.js — COMPLETE REPLACEMENT
 *
 * Changes:
 *  1. Consistent responses via apiResponse helpers
 *  2. io.emit() → io.to(userId).emit() for groupMemberAdded
 *  3. next(error) throughout
 */

import * as groupService from "../services/groupService.js";
import * as activityLogService from "../services/activityLogService.js";
import { sendSuccess, sendCreated } from "../utils/apiResponse.js";

const getIp = (req) => req.ip || req.headers["x-forwarded-for"] || null;

export const createGroup = async (req, res, next) => {
  try {
    const group = await groupService.createGroup({
      ...req.body,
      creatorId: req.user._id,
      ipAddress: getIp(req),
    });
    return sendCreated(res, group, "Group created");
  } catch (error) {
    next(error);
  }
};

export const getUserGroups = async (req, res, next) => {
  try {
    const groups = await groupService.getUserGroups(req.user._id);
    return sendSuccess(res, groups, "Groups retrieved");
  } catch (error) {
    next(error);
  }
};

export const getGroupById = async (req, res, next) => {
  try {
    const group = await groupService.getGroupById(req.params.id, req.user._id);
    return sendSuccess(res, group, "Group retrieved");
  } catch (error) {
    next(error);
  }
};

export const updateGroup = async (req, res, next) => {
  try {
    const group = await groupService.updateGroup({
      groupId: req.params.id,
      requestingUserId: req.user._id,
      updates: req.body,
      ipAddress: getIp(req),
    });
    return sendSuccess(res, group, "Group updated");
  } catch (error) {
    next(error);
  }
};

export const inviteMember = async (req, res, next) => {
  try {
    const result = await groupService.inviteMember({
      groupId: req.params.id,
      requestingUserId: req.user._id,
      email: req.body.email,
      role: req.body.role,
      ipAddress: getIp(req),
    });

    // Emit only to the newly added user's room
    const io = req.app.get("io");
    if (io && result.userId) {
      io.to(String(result.userId)).emit("groupMemberAdded", {
        groupId: req.params.id,
        userId: result.userId,
      });
    }

    return sendSuccess(res, result, "Member invited successfully");
  } catch (error) {
    next(error);
  }
};

export const removeMember = async (req, res, next) => {
  try {
    const result = await groupService.removeMember({
      groupId: req.params.id,
      requestingUserId: req.user._id,
      targetUserId: req.params.userId,
      ipAddress: getIp(req),
    });
    return sendSuccess(res, null, result.message || "Member removed");
  } catch (error) {
    next(error);
  }
};

export const changeMemberRole = async (req, res, next) => {
  try {
    const result = await groupService.changeMemberRole({
      groupId: req.params.id,
      requestingUserId: req.user._id,
      targetUserId: req.body.userId,
      role: req.body.role,
      ipAddress: getIp(req),
    });
    return sendSuccess(res, null, result.message || "Role updated");
  } catch (error) {
    next(error);
  }
};

export const deleteGroup = async (req, res, next) => {
  try {
    const result = await groupService.deleteGroup({
      groupId: req.params.id,
      requestingUserId: req.user._id,
      ipAddress: getIp(req),
    });
    return sendSuccess(res, null, result.message || "Group deleted");
  } catch (error) {
    next(error);
  }
};

export const getGroupActivityLogs = async (req, res, next) => {
  try {
    await groupService.getGroupById(req.params.id, req.user._id);
    const result = await activityLogService.getGroupLogs({
      groupId: req.params.id,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
    });
    return sendSuccess(res, result, "Activity logs retrieved");
  } catch (error) {
    next(error);
  }
};
