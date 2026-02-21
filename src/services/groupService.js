import mongoose from "mongoose";
import Group from "../models/Group.js";
import User from "../models/User.js";
import { createLog } from "./activityLogService.js";

// ─── CREATE GROUP ─────────────────────────────────────────────────────────────

export const createGroup = async ({
  name,
  description,
  creatorId,
  ipAddress,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Create group with creator as ADMIN
    const [group] = await Group.create(
      [
        {
          name,
          description,
          createdBy: creatorId,
          members: [{ userId: creatorId, role: "ADMIN" }],
        },
      ],
      { session },
    );

    // 2. Push group ref into User document
    await User.findByIdAndUpdate(
      creatorId,
      { $addToSet: { groups: group._id } },
      { session },
    );

    // 3. Activity log
    await createLog(
      {
        userId: creatorId,
        groupId: group._id,
        action: "GROUP_CREATED",
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();
    return group;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// ─── GET USER GROUPS ──────────────────────────────────────────────────────────

export const getUserGroups = async (userId) => {
  return Group.find({
    "members.userId": userId,
    isActive: true,
  })
    .populate("createdBy", "name email")
    .populate("members.userId", "name email")
    .lean();
};

// ─── GET GROUP BY ID ──────────────────────────────────────────────────────────

export const getGroupById = async (groupId, requestingUserId) => {
  const group = await Group.findOne({ _id: groupId, isActive: true })
    .populate("createdBy", "name email")
    .populate("members.userId", "name email")
    .lean();

  if (!group) throw new Error("Group not found");

  const isMember = group.members.some(
    (m) => m.userId._id.toString() === requestingUserId.toString(),
  );
  if (!isMember)
    throw new Error("Access denied: You are not a member of this group");

  return group;
};

// ─── UPDATE GROUP ─────────────────────────────────────────────────────────────

export const updateGroup = async ({
  groupId,
  requestingUserId,
  updates,
  ipAddress,
}) => {
  const group = await Group.findById(groupId);
  if (!group || !group.isActive) throw new Error("Group not found");

  const member = group.members.find(
    (m) => m.userId.toString() === requestingUserId.toString(),
  );
  if (!member || member.role !== "ADMIN")
    throw new Error("Only group admins can update group details");

  Object.assign(group, updates);
  await group.save();

  await createLog({
    userId: requestingUserId,
    groupId: group._id,
    action: "GROUP_UPDATED",
    metadata: updates,
    ipAddress,
  });

  return group;
};

// ─── INVITE MEMBER ────────────────────────────────────────────────────────────

export const inviteMember = async ({
  groupId,
  requestingUserId,
  email,
  role,
  ipAddress,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const group = await Group.findById(groupId).session(session);
    if (!group || !group.isActive) throw new Error("Group not found");

    // Only ADMIN can invite
    const requester = group.members.find(
      (m) => m.userId.toString() === requestingUserId.toString(),
    );
    if (!requester || requester.role !== "ADMIN")
      throw new Error("Only group admins can invite members");

    // Find user to invite
    const userToInvite = await User.findOne({
      email,
      status: "ACTIVE",
    }).session(session);
    if (!userToInvite) throw new Error("User not found or inactive");

    // Check if already member
    const alreadyMember = group.members.some(
      (m) => m.userId.toString() === userToInvite._id.toString(),
    );
    if (alreadyMember)
      throw new Error("User is already a member of this group");

    // Add to group
    group.members.push({ userId: userToInvite._id, role });
    await group.save({ session });

    // Add group to user's groups array
    await User.findByIdAndUpdate(
      userToInvite._id,
      { $addToSet: { groups: group._id } },
      { session },
    );

    // Log
    await createLog(
      {
        userId: requestingUserId,
        groupId: group._id,
        action: "GROUP_MEMBER_ADDED",
        metadata: { invitedUserId: userToInvite._id, role },
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();
    return { message: "Member invited successfully", userId: userToInvite._id };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// ─── REMOVE MEMBER ────────────────────────────────────────────────────────────

export const removeMember = async ({
  groupId,
  requestingUserId,
  targetUserId,
  ipAddress,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const group = await Group.findById(groupId).session(session);
    if (!group || !group.isActive) throw new Error("Group not found");

    const requester = group.members.find(
      (m) => m.userId.toString() === requestingUserId.toString(),
    );

    // Admin can remove others; members can only remove themselves (leave)
    const isSelf = requestingUserId.toString() === targetUserId.toString();
    if (!isSelf && (!requester || requester.role !== "ADMIN"))
      throw new Error("Only admins can remove other members");

    // Prevent removing the last admin
    const admins = group.members.filter((m) => m.role === "ADMIN");
    const targetIsAdmin = group.members.find(
      (m) =>
        m.userId.toString() === targetUserId.toString() && m.role === "ADMIN",
    );
    if (targetIsAdmin && admins.length === 1)
      throw new Error(
        "Cannot remove the only admin. Transfer admin role first.",
      );

    group.members = group.members.filter(
      (m) => m.userId.toString() !== targetUserId.toString(),
    );
    await group.save({ session });

    await User.findByIdAndUpdate(
      targetUserId,
      { $pull: { groups: group._id } },
      { session },
    );

    await createLog(
      {
        userId: requestingUserId,
        groupId: group._id,
        action: "GROUP_MEMBER_REMOVED",
        metadata: { removedUserId: targetUserId },
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();
    return {
      message: isSelf
        ? "Left group successfully"
        : "Member removed successfully",
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// ─── CHANGE MEMBER ROLE ───────────────────────────────────────────────────────

export const changeMemberRole = async ({
  groupId,
  requestingUserId,
  targetUserId,
  role,
  ipAddress,
}) => {
  const group = await Group.findById(groupId);
  if (!group || !group.isActive) throw new Error("Group not found");

  const requester = group.members.find(
    (m) => m.userId.toString() === requestingUserId.toString(),
  );
  if (!requester || requester.role !== "ADMIN")
    throw new Error("Only admins can change member roles");

  const target = group.members.find(
    (m) => m.userId.toString() === targetUserId.toString(),
  );
  if (!target) throw new Error("Target user is not a member of this group");

  target.role = role;
  await group.save();

  await createLog({
    userId: requestingUserId,
    groupId: group._id,
    action: "GROUP_ROLE_CHANGED",
    metadata: { targetUserId, newRole: role },
    ipAddress,
  });

  return { message: "Role updated successfully" };
};

// ─── DELETE GROUP ─────────────────────────────────────────────────────────────

export const deleteGroup = async ({ groupId, requestingUserId, ipAddress }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const group = await Group.findById(groupId).session(session);
    if (!group || !group.isActive) throw new Error("Group not found");

    const requester = group.members.find(
      (m) => m.userId.toString() === requestingUserId.toString(),
    );
    if (!requester || requester.role !== "ADMIN")
      throw new Error("Only group admins can delete the group");

    // Soft delete
    group.isActive = false;
    await group.save({ session });

    // Remove group ref from all member User docs
    const memberIds = group.members.map((m) => m.userId);
    await User.updateMany(
      { _id: { $in: memberIds } },
      { $pull: { groups: group._id } },
      { session },
    );

    await createLog(
      {
        userId: requestingUserId,
        groupId: group._id,
        action: "GROUP_DELETED",
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();
    return { message: "Group deleted successfully" };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
