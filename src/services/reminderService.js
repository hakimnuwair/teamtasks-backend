/**
 * services/reminderService.js
 *
 * Per-user completion: completeReminder() adds to userCompletions[].
 * Group reminder becomes COMPLETED only when ALL assigned users complete.
 * Personal reminders complete globally as before.
 *
 * All array inserts with sessions use { ordered: true } — required by MongoDB
 * when using sessions with multi-document inserts.
 */

import mongoose from "mongoose";
import Reminder from "../models/Reminder.js";
import Group from "../models/Group.js";
import Notification from "../models/Notification.js";
import { createLog } from "./activityLogService.js";

const resolveAssignedUsers = async (
  groupId,
  assignedUsers,
  creatorId,
  session,
) => {
  if (!groupId) return [creatorId];
  const group = await Group.findOne({ _id: groupId, isActive: true }).session(
    session,
  );
  if (!group) throw new Error("Group not found");
  const memberIds = group.members.map((m) => m.userId.toString());
  if (assignedUsers && assignedUsers.length > 0) {
    const invalid = assignedUsers.filter(
      (id) => !memberIds.includes(id.toString()),
    );
    if (invalid.length > 0)
      throw new Error("Some users are not members of this group");
    return assignedUsers;
  }
  return group.members.map((m) => m.userId);
};

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

    // ordered: true required for array inserts within a session
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
          userCompletions: [],
        },
      ],
      { session, ordered: true },
    );

    const toNotify = resolvedUsers.filter(
      (uid) => uid.toString() !== creatorId.toString(),
    );
    if (toNotify.length > 0) {
      await Notification.create(
        toNotify.map((uid) => ({
          userId: uid,
          reminderId: reminder._id,
          groupId: groupId || null,
          type: "REMINDER_ASSIGNED",
          message: `You have been assigned a reminder: "${title}"`,
        })),
        { session, ordered: true },
      );
    }

    await createLog(
      {
        userId: creatorId,
        groupId: groupId || null,
        reminderId: reminder._id,
        action: "REMINDER_CREATED",
        metadata: { title, assignedCount: resolvedUsers.length },
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();
    return reminder;
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
};

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

export const getGroupReminders = async ({
  groupId,
  requestingUserId,
  status,
  page = 1,
  limit = 20,
}) => {
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
  if (!isAssigned && !isCreator) throw new Error("Access denied");
  return reminder;
};

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
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
};

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
    const alreadyDone = reminder.userCompletions.some(
      (uc) => uc.userId.toString() === requestingUserId.toString(),
    );
    if (alreadyDone)
      throw new Error("You have already completed this reminder");

    reminder.userCompletions.push({
      userId: requestingUserId,
      completedAt: new Date(),
    });

    if (!reminder.groupId) {
      reminder.status = "COMPLETED";
      reminder.completedAt = new Date();
    } else {
      const completedIds = new Set(
        reminder.userCompletions.map((uc) => uc.userId.toString()),
      );
      if (
        reminder.assignedUsers.every((uid) => completedIds.has(uid.toString()))
      ) {
        reminder.status = "COMPLETED";
        reminder.completedAt = new Date();
      }
    }

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

    return Reminder.findById(reminder._id)
      .populate("createdBy", "name email")
      .populate("assignedUsers", "name email")
      .populate("userCompletions.userId", "name email")
      .populate("groupId", "name")
      .lean();
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
};

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
    if (reminder.createdBy.toString() !== requestingUserId.toString())
      throw new Error("Only the creator can delete this reminder");
    if (reminder.isDeleted) throw new Error("Reminder is already deleted");
    reminder.isDeleted = true;
    reminder.deletedAt = new Date();
    reminder.deletedBy = requestingUserId;
    await reminder.save({ session });
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
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
};
