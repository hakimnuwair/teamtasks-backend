import * as reminderService from "../services/reminderService.js";

const getIp = (req) => req.ip || req.headers["x-forwarded-for"] || null;

export const createReminder = async (req, res) => {
  try {
    const reminder = await reminderService.createReminder(
      { ...req.body, creatorId: req.user._id },
      getIp(req),
    );

    const io = req.app.get("io");
    if (io) io.emit("reminderCreated", { reminder });

    return res.status(201).json({ success: true, data: reminder });
  } catch (error) {
    const status = error.message.includes("not found") ? 404 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const getMyReminders = async (req, res) => {
  try {
    const { status, priority, page, limit } = req.query;
    const result = await reminderService.getMyReminders({
      userId: req.user._id,
      status,
      priority,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getGroupReminders = async (req, res) => {
  try {
    const { status, page, limit } = req.query;
    const result = await reminderService.getGroupReminders({
      groupId: req.params.groupId,
      requestingUserId: req.user._id,
      status,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const status = error.message.includes("denied") ? 403 : 404;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const getReminderById = async (req, res) => {
  try {
    const reminder = await reminderService.getReminderById({
      reminderId: req.params.id,
      requestingUserId: req.user._id,
    });
    return res.status(200).json({ success: true, data: reminder });
  } catch (error) {
    const status = error.message.includes("not found")
      ? 404
      : error.message.includes("denied")
        ? 403
        : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const updateReminder = async (req, res) => {
  try {
    const reminder = await reminderService.updateReminder({
      reminderId: req.params.id,
      requestingUserId: req.user._id,
      updates: req.body,
      ipAddress: getIp(req),
    });

    const io = req.app.get("io");
    if (io) io.emit("reminderUpdated", { reminder });

    return res.status(200).json({ success: true, data: reminder });
  } catch (error) {
    const status = error.message.includes("not found")
      ? 404
      : error.message.includes("creator")
        ? 403
        : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const completeReminder = async (req, res) => {
  try {
    const reminder = await reminderService.completeReminder({
      reminderId: req.params.id,
      requestingUserId: req.user._id,
      ipAddress: getIp(req),
    });

    const io = req.app.get("io");
    if (io) io.emit("reminderCompleted", { reminderId: reminder._id });

    return res.status(200).json({ success: true, data: reminder });
  } catch (error) {
    const status = error.message.includes("not found")
      ? 404
      : error.message.includes("authorized")
        ? 403
        : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const deleteReminder = async (req, res) => {
  try {
    const result = await reminderService.deleteReminder({
      reminderId: req.params.id,
      requestingUserId: req.user._id,
      ipAddress: getIp(req),
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const status = error.message.includes("not found")
      ? 404
      : error.message.includes("creator")
        ? 403
        : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};
