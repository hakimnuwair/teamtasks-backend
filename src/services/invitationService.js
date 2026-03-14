// services/invitationService.js
import mongoose from "mongoose";
import GroupInvitation from "../models/GroupInvitation.js";
import Group from "../models/Group.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { createLog } from "./activityLogService.js";

// ─── SEND INVITATION ──────────────────────────────────────────────────────────

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

    // Only admins can invite
    const requester = group.members.find(
      (m) => m.userId.toString() === requestingUserId.toString(),
    );
    if (!requester || requester.role !== "ADMIN")
      throw new Error("Only group admins can send invitations");

    // Find the user to invite
    const invitedUser = await User.findOne({ email, status: "ACTIVE" }).session(
      session,
    );
    if (!invitedUser) throw new Error("No active user found with that email");

    // Already a member?
    const alreadyMember = group.members.some(
      (m) => m.userId.toString() === invitedUser._id.toString(),
    );
    if (alreadyMember)
      throw new Error("User is already a member of this group");

    // Already has a pending invite?
    const existing = await GroupInvitation.findOne({
      groupId,
      invitedUser: invitedUser._id,
      status: "PENDING",
    }).session(session);
    if (existing)
      throw new Error("A pending invitation already exists for this user");

    // Create invitation
    const [invitation] = await GroupInvitation.create(
      [
        {
          groupId,
          invitedBy: requestingUserId,
          invitedUser: invitedUser._id,
          role,
        },
      ],
      { session },
    );

    // Notify the invited user
    await Notification.create(
      [
        {
          userId: invitedUser._id,
          groupId,
          type: "GROUP_INVITE",
          message: `You have been invited to join "${group.name}"`,
          metadata: { invitationId: invitation._id },
        },
      ],
      { session },
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
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// ─── GET MY PENDING INVITATIONS ───────────────────────────────────────────────

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

// ─── RESPOND TO INVITATION ────────────────────────────────────────────────────

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

      // Guard: don't double-add if already a member
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

    await session.commitTransaction();
    return { accepted: accept };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// ─── CANCEL INVITATION (by admin) ────────────────────────────────────────────

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
