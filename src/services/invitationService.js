/**
 * services/invitationService.js
 *
 * All array inserts within sessions use { ordered: true } — required by MongoDB.
 * invitationId stored as plain string in notification metadata (not ObjectId).
 */

import mongoose from "mongoose";
import GroupInvitation from "../models/GroupInvitation.js";
import Group from "../models/Group.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { createLog } from "./activityLogService.js";

export const sendInvitation = async ({
  groupId,
  requestingUserId,
  email,
  role = "MEMBER",
  ipAddress,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const group = await Group.findOne({ _id: groupId, isActive: true }).session(
      session,
    );
    if (!group) throw new Error("Group not found");
    const requester = group.members.find(
      (m) => m.userId.toString() === requestingUserId.toString(),
    );
    if (!requester || requester.role !== "ADMIN")
      throw new Error("Only group admins can send invitations");

    const invitedUser = await User.findOne({ email, status: "ACTIVE" }).session(
      session,
    );
    if (!invitedUser) throw new Error("No active user found with that email");

    const alreadyMember = group.members.some(
      (m) => m.userId.toString() === invitedUser._id.toString(),
    );
    if (alreadyMember)
      throw new Error("User is already a member of this group");

    const existing = await GroupInvitation.findOne({
      groupId,
      invitedUser: invitedUser._id,
      status: "PENDING",
    }).session(session);
    if (existing)
      throw new Error("A pending invitation already exists for this user");

    // ordered: true required for session + array insert
    const [invitation] = await GroupInvitation.create(
      [
        {
          groupId,
          invitedBy: requestingUserId,
          invitedUser: invitedUser._id,
          role,
        },
      ],
      { session, ordered: true },
    );

    // Store invitationId as STRING for frontend metadata reads
    await Notification.create(
      [
        {
          userId: invitedUser._id,
          groupId,
          type: "GROUP_INVITE",
          message: `You have been invited to join "${group.name}"`,
          metadata: { invitationId: invitation._id.toString() },
        },
      ],
      { session, ordered: true },
    );

    await createLog(
      {
        userId: requestingUserId,
        groupId,
        action: "GROUP_INVITATION_SENT",
        metadata: { invitedUserId: invitedUser._id, role },
        ipAddress,
      },
      session,
    );

    await session.commitTransaction();
    return invitation;
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
};

export const getMyInvitations = async (userId) => {
  return GroupInvitation.find({
    invitedUser: userId,
    status: "PENDING",
    expiresAt: { $gt: new Date() },
  })
    .populate("groupId", "name description members")
    .populate("invitedBy", "name email")
    .lean();
};

export const respondToInvitation = async ({
  invitationId,
  requestingUserId,
  accept,
  ipAddress,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const invitation = await GroupInvitation.findOne({
      _id: invitationId,
      invitedUser: requestingUserId,
      status: "PENDING",
    }).session(session);
    if (!invitation)
      throw new Error("Invitation not found or already responded");
    if (invitation.expiresAt < new Date())
      throw new Error("Invitation has expired");

    invitation.status = accept ? "ACCEPTED" : "DECLINED";
    await invitation.save({ session });

    if (accept) {
      const group = await Group.findById(invitation.groupId).session(session);
      if (!group || !group.isActive) throw new Error("Group no longer exists");
      const alreadyMember = group.members.some(
        (m) => m.userId.toString() === requestingUserId.toString(),
      );
      if (!alreadyMember) {
        group.members.push({ userId: requestingUserId, role: invitation.role });
        await group.save({ session });
        await User.findByIdAndUpdate(
          requestingUserId,
          { $addToSet: { groups: group._id } },
          { session },
        );
      }
      await createLog(
        {
          userId: requestingUserId,
          groupId: invitation.groupId,
          action: "GROUP_INVITATION_ACCEPTED",
          ipAddress,
        },
        session,
      );
    } else {
      await createLog(
        {
          userId: requestingUserId,
          groupId: invitation.groupId,
          action: "GROUP_INVITATION_DECLINED",
          ipAddress,
        },
        session,
      );
    }

    await Notification.updateMany(
      {
        userId: requestingUserId,
        type: "GROUP_INVITE",
        "metadata.invitationId": invitationId.toString(),
      },
      { $set: { isRead: true } },
      { session },
    );

    await session.commitTransaction();
    return { accepted: accept };
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
};

export const cancelInvitation = async ({
  invitationId,
  requestingUserId,
  ipAddress,
}) => {
  const invitation =
    await GroupInvitation.findById(invitationId).populate("groupId");
  if (!invitation || invitation.status !== "PENDING")
    throw new Error("Invitation not found or already resolved");
  const group = invitation.groupId;
  const isAdmin = group.members.some(
    (m) =>
      m.userId.toString() === requestingUserId.toString() && m.role === "ADMIN",
  );
  if (!isAdmin) throw new Error("Only group admins can cancel invitations");
  invitation.status = "CANCELLED";
  await invitation.save();
  await createLog({
    userId: requestingUserId,
    groupId: group._id,
    action: "GROUP_INVITATION_CANCELLED",
    metadata: { invitationId },
    ipAddress,
  });
  return { message: "Invitation cancelled" };
};
