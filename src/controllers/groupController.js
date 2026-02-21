import * as groupService from "../services/groupService.js";
import * as activityLogService from "../services/activityLogService.js";

const getIp = (req) => req.ip || req.headers["x-forwarded-for"] || null;

export const createGroup = async (req, res) => {
  try {
    const group = await groupService.createGroup({
      ...req.body,
      creatorId: req.user._id,
      ipAddress: getIp(req),
    });
    return res.status(201).json({ success: true, data: group });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getUserGroups = async (req, res) => {
  try {
    const groups = await groupService.getUserGroups(req.user._id);
    return res.status(200).json({ success: true, data: groups });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getGroupById = async (req, res) => {
  try {
    const group = await groupService.getGroupById(req.params.id, req.user._id);
    return res.status(200).json({ success: true, data: group });
  } catch (error) {
    const status = error.message.includes("not found")
      ? 404
      : error.message.includes("denied")
        ? 403
        : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const updateGroup = async (req, res) => {
  try {
    const group = await groupService.updateGroup({
      groupId: req.params.id,
      requestingUserId: req.user._id,
      updates: req.body,
      ipAddress: getIp(req),
    });
    return res.status(200).json({ success: true, data: group });
  } catch (error) {
    const status = error.message.includes("not found")
      ? 404
      : error.message.includes("Only")
        ? 403
        : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const inviteMember = async (req, res) => {
  try {
    const result = await groupService.inviteMember({
      groupId: req.params.id,
      requestingUserId: req.user._id,
      email: req.body.email,
      role: req.body.role,
      ipAddress: getIp(req),
    });

    // Emit socket event
    const io = req.app.get("io");
    if (io) io.emit("groupMemberAdded", { groupId: req.params.id, ...result });

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const status = error.message.includes("not found")
      ? 404
      : error.message.includes("Only")
        ? 403
        : error.message.includes("already")
          ? 409
          : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const removeMember = async (req, res) => {
  try {
    const result = await groupService.removeMember({
      groupId: req.params.id,
      requestingUserId: req.user._id,
      targetUserId: req.params.userId,
      ipAddress: getIp(req),
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const status = error.message.includes("not found")
      ? 404
      : error.message.includes("Only")
        ? 403
        : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const changeMemberRole = async (req, res) => {
  try {
    const result = await groupService.changeMemberRole({
      groupId: req.params.id,
      requestingUserId: req.user._id,
      targetUserId: req.body.userId,
      role: req.body.role,
      ipAddress: getIp(req),
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const status = error.message.includes("not found")
      ? 404
      : error.message.includes("Only")
        ? 403
        : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const deleteGroup = async (req, res) => {
  try {
    const result = await groupService.deleteGroup({
      groupId: req.params.id,
      requestingUserId: req.user._id,
      ipAddress: getIp(req),
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const status = error.message.includes("not found")
      ? 404
      : error.message.includes("Only")
        ? 403
        : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const getGroupActivityLogs = async (req, res) => {
  try {
    // Validate requester is a group member (getGroupById does the check)
    await groupService.getGroupById(req.params.id, req.user._id);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await activityLogService.getGroupLogs({
      groupId: req.params.id,
      page,
      limit,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(403).json({ success: false, message: error.message });
  }
};
