import mongoose from "mongoose";
import Reminder from "../models/Reminder.js";
import Group from "../models/Group.js";
import Notification from "../models/Notification.js";
import { createLog } from "./activityLogService.js";

// ─── HELPER: Resolve assignedUsers ────────────────────────────────────────────

const resolveAssignedUsers = async (
  groupId,
  assignedUsers,
  creatorId,
  session,
) => {
  // Case 1: Personal reminder
  if (!groupId) return [creatorId];

  // Case 2: Group reminder — validate group exists
  const group = await Group.findOne({ _id: groupId, isActive: true }).session(
    session,
  );
  if (!group) throw new Error("Group not found");

  const memberIds = group.members.map((m) => m.userId.toString());

  // Case 3: Specific users — validate they're all group members
  if (assignedUsers && assignedUsers.length > 0) {
    const invalidUsers = assignedUsers.filter(
      (id) => !memberIds.includes(id.toString()),
    );
    if (invalidUsers.length > 0)
      throw new Error(
        `Some users are not members of this group: ${invalidUsers.join(", ")}`,
      );
    return assignedUsers;
  }

  // Case 4: Assign all group members
  return group.members.map((m) => m.userId);
};

// ─── CREATE REMINDER ──────────────────────────────────────────────────────────

export const createReminder = async (
  {
    title,
    description,
    dueDateTime,
    recurrence,
    groupId,
    assignedUsers,
    priority,
    creatorId,
  },
  ipAddress,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const resolvedUsers = await resolveAssignedUsers(
      groupId,
      assignedUsers,
      creatorId,
      session,
    );

    const [reminder] = await Reminder.create(
      [
        {
          title,
          description,
          dueDateTime,
          recurrence,
          groupId: groupId || null,
          createdBy: creatorId,
          assignedUsers: resolvedUsers,
          priority,
        },
      ],
      { session },
    );

    // Create in-app notifications for all assigned users (except creator)
    const notificationsToCreate = resolvedUsers
      .filter((uid) => uid.toString() !== creatorId.toString())
      .map((uid) => ({
        userId: uid,
        reminderId: reminder._id,
        groupId: groupId || null,
        type: "REMINDER_ASSIGNED",
        message: `You have been assigned a reminder: "${title}"`,
      }));

    if (notificationsToCreate.length > 0) {
      await Notification.create(notificationsToCreate, { session });
    }

    await createLog(
      {
        userId: creatorId,
        groupId: groupId || null,
        reminderId: reminder._id,
        action: "REMINDER_CREATED",
        metadata: { title, assignedUsers: resolvedUsers },
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();
    return reminder;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// ─── GET MY REMINDERS ─────────────────────────────────────────────────────────

export const getMyReminders = async ({
  userId,
  status,
  priority,
  page = 1,
  limit = 20,
}) => {
  const filter = { assignedUsers: userId };
  if (status) filter.status = status;
  if (priority) filter.priority = priority;

  const skip = (page - 1) * limit;

  const [reminders, total] = await Promise.all([
    Reminder.find(filter)
      .sort({ dueDateTime: 1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email")
      .populate("assignedUsers", "name email")
      .populate("groupId", "name")
      .lean(),
    Reminder.countDocuments(filter),
  ]);

  return {
    reminders,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ─── GET GROUP REMINDERS ──────────────────────────────────────────────────────

export const getGroupReminders = async ({
  groupId,
  requestingUserId,
  status,
  page = 1,
  limit = 20,
}) => {
  // Validate membership
  const group = await Group.findOne({
    _id: groupId,
    isActive: true,
    "members.userId": requestingUserId,
  });
  if (!group) throw new Error("Group not found or access denied");

  const filter = { groupId };
  if (status) filter.status = status;

  const skip = (page - 1) * limit;

  const [reminders, total] = await Promise.all([
    Reminder.find(filter)
      .sort({ dueDateTime: 1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email")
      .populate("assignedUsers", "name email")
      .populate("groupId", "name")
      .lean(),
    Reminder.countDocuments(filter),
  ]);

  return {
    reminders,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ─── GET REMINDER BY ID ───────────────────────────────────────────────────────

export const getReminderById = async ({ reminderId, requestingUserId }) => {
  const reminder = await Reminder.findById(reminderId)
    .populate("createdBy", "name email")
    .populate("assignedUsers", "name email")
    .populate("groupId", "name")
    .lean();

  if (!reminder) throw new Error("Reminder not found");

  const isAssigned = reminder.assignedUsers.some(
    (u) => u._id.toString() === requestingUserId.toString(),
  );
  const isCreator =
    reminder.createdBy._id.toString() === requestingUserId.toString();

  if (!isAssigned && !isCreator)
    throw new Error("Access denied: You are not associated with this reminder");

  return reminder;
};

// ─── UPDATE REMINDER ──────────────────────────────────────────────────────────

export const updateReminder = async ({
  reminderId,
  requestingUserId,
  updates,
  ipAddress,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const reminder = await Reminder.findById(reminderId).session(session);
    if (!reminder) throw new Error("Reminder not found");

    if (reminder.createdBy.toString() !== requestingUserId.toString())
      throw new Error("Only the creator can update this reminder");

    if (reminder.status === "COMPLETED")
      throw new Error("Cannot update a completed reminder");

    // If reassigning users, validate group membership
    if (updates.assignedUsers && reminder.groupId) {
      updates.assignedUsers = await resolveAssignedUsers(
        reminder.groupId,
        updates.assignedUsers,
        requestingUserId,
        session,
      );
    }

    Object.assign(reminder, updates);
    await reminder.save({ session });

    await createLog(
      {
        userId: requestingUserId,
        groupId: reminder.groupId || null,
        reminderId: reminder._id,
        action: "REMINDER_UPDATED",
        metadata: updates,
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();
    return reminder;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// ─── COMPLETE REMINDER ────────────────────────────────────────────────────────

export const completeReminder = async ({
  reminderId,
  requestingUserId,
  ipAddress,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const reminder = await Reminder.findById(reminderId).session(session);
    if (!reminder) throw new Error("Reminder not found");

    const isAssigned = reminder.assignedUsers.some(
      (uid) => uid.toString() === requestingUserId.toString(),
    );
    const isCreator =
      reminder.createdBy.toString() === requestingUserId.toString();

    if (!isAssigned && !isCreator)
      throw new Error("You are not authorized to complete this reminder");

    if (reminder.status === "COMPLETED")
      throw new Error("Reminder is already completed");

    reminder.status = "COMPLETED";
    reminder.completedAt = new Date();
    await reminder.save({ session });

    await createLog(
      {
        userId: requestingUserId,
        groupId: reminder.groupId || null,
        reminderId: reminder._id,
        action: "REMINDER_COMPLETED",
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();
    return reminder;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// ─── DELETE REMINDER ──────────────────────────────────────────────────────────

export const deleteReminder = async ({
  reminderId,
  requestingUserId,
  ipAddress,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const reminder = await Reminder.findById(reminderId).session(session);

    if (!reminder) throw new Error("Reminder not found");

    if (reminder.createdBy.toString() !== requestingUserId.toString()) {
      throw new Error("Only the creator can delete this reminder");
    }

    if (reminder.isDeleted) {
      throw new Error("Reminder is already deleted");
    }

    // ✅ SOFT DELETE
    reminder.isDeleted = true;
    reminder.deletedAt = new Date();
    reminder.deletedBy = requestingUserId;

    await reminder.save({ session });

    // Mark related notifications as deleted instead of removing
    await Notification.updateMany(
      { reminderId: reminder._id },
      { $set: { isDeleted: true } },
      { session },
    );

    await createLog(
      {
        userId: requestingUserId,
        groupId: reminder.groupId || null,
        reminderId: reminder._id,
        action: "REMINDER_DELETED",
        metadata: { title: reminder.title },
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();

    return { message: "Reminder deleted successfully" };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
