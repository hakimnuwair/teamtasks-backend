import Notification from "../models/Notification.js";

// ─── GET USER NOTIFICATIONS ───────────────────────────────────────────────────

export const getUserNotifications = async ({
  userId,
  page = 1,
  limit = 20,
  unreadOnly = false,
}) => {
  const baseFilter = {
    userId,
    isDeleted: false,
  };

  if (unreadOnly) baseFilter.isRead = false;

  const skip = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(baseFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("reminderId", "title dueDateTime")
      .populate("groupId", "name")
      .lean(),

    Notification.countDocuments(baseFilter),

    Notification.countDocuments({
      userId,
      isRead: false,
      isDeleted: false,
    }),
  ]);

  return {
    notifications,
    total,
    unreadCount,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ─── MARK AS READ ─────────────────────────────────────────────────────────────

export const markAsRead = async ({ userId, notificationIds }) => {
  const result = await Notification.updateMany(
    { _id: { $in: notificationIds }, userId }, // userId guard: prevent marking others' notifications
    { $set: { isRead: true, readAt: new Date() } },
  );

  return { modifiedCount: result.modifiedCount };
};

// ─── MARK ALL AS READ ─────────────────────────────────────────────────────────

export const markAllAsRead = async (userId) => {
  const result = await Notification.updateMany(
    {
      userId,
      isRead: false,
      isDeleted: false,
    },
    { $set: { isRead: true, readAt: new Date() } },
  );

  return { modifiedCount: result.modifiedCount };
};

// ─── DELETE A NOTIFICATION ────────────────────────────────────────────────────

export const deleteNotification = async ({ userId, notificationId }) => {
  const notification = await Notification.findOne({
    _id: notificationId,
    userId,
  });

  if (!notification) {
    throw new Error("Notification not found");
  }

  if (notification.isDeleted) {
    throw new Error("Notification already deleted");
  }

  // SOFT DELETE
  notification.isDeleted = true;
  notification.deletedAt = new Date();
  notification.deletedBy = userId;

  await notification.save();

  return { message: "Notification deleted successfully" };
};
