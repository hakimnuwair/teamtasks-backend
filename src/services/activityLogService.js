import ActivityLog from "../models/ActivityLog.js";
import Reminder from "../models/Reminder.js";
import User from "../models/User.js";

const enrichMetadataUsers = async (logs) => {
  const userIdFields = ["invitedUserId", "removedUserId", "targetUserId"];

  const metaUserIds = [
    ...new Set(
      logs.flatMap((log) =>
        userIdFields
          .filter((f) => log.metadata?.[f])
          .map((f) => log.metadata[f].toString()),
      ),
    ),
  ];

  if (metaUserIds.length === 0) return;

  const users = await User.find(
    { _id: { $in: metaUserIds } },
    "name email",
  ).lean();
  const userMap = Object.fromEntries(
    users.map((u) => [
      u._id.toString(),
      { _id: u._id, name: u.name, email: u.email },
    ]),
  );

  for (const log of logs) {
    for (const field of userIdFields) {
      if (log.metadata?.[field]) {
        log.metadata[field] =
          userMap[log.metadata[field].toString()] ?? log.metadata[field];
      }
    }
  }
};

/**
 * Creates an activity log entry.
 * Pass session if inside a MongoDB transaction.
 */
export const createLog = async (
  {
    userId,
    groupId = null,
    reminderId = null,
    action,
    metadata = {},
    ipAddress = null,
  },
  session = null,
) => {
  const logData = [
    { userId, groupId, reminderId, action, metadata, ipAddress },
  ];

  const options = session ? { session } : {};
  const [log] = await ActivityLog.create(logData, options);
  return log;
};

/**
 * Fetch activity logs for a user (paginated).
 */
export const getUserLogs = async ({ userId, page = 1, limit = 20 }) => {
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    ActivityLog.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name")
      .populate("groupId", "name")
      .populate("reminderId", "title")
      .lean(),
    ActivityLog.countDocuments({ userId }),
  ]);

  return {
    logs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Fetch activity logs for a group (paginated).
 */
export const getGroupLogs = async ({ groupId, page = 1, limit = 20 }) => {
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    ActivityLog.find({ groupId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name email")
      .populate("reminderId", "title")
      .lean(),
    ActivityLog.countDocuments({ groupId }),
  ]);

  await enrichMetadataUsers(logs);

  return {
    logs,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};
