import * as activityLogService from "../services/activityLogService.js";

export const getMyActivityLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await activityLogService.getUserLogs({
      userId: req.user._id,
      page,
      limit,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
