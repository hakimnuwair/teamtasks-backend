/**
 * controllers/invitationController.js — COMPLETE REPLACEMENT
 * Place at: controllers/invitationController.js
 *
 * Added: socket emit to invited user's room on sendInvitation.
 */

import {
  sendInvitation,
  getMyInvitations,
  respondToInvitation,
  cancelInvitation,
} from "../services/invitationService.js";
import { sendSuccess, sendCreated } from "../utils/apiResponse.js";

export const sendInvitationController = async (req, res, next) => {
  try {
    const invitation = await sendInvitation({
      groupId: req.params.groupId,
      requestingUserId: req.user._id,
      email: req.body.email,
      role: req.body.role ?? "MEMBER",
      ipAddress: req.ip,
    });

    // Notify the invited user in real-time via their socket room
    const io = req.app.get("io");
    if (io && invitation.invitedUser) {
      io.to(String(invitation.invitedUser)).emit("notificationTriggered", {
        message: `You've been invited to join a group`,
        invitationId: invitation._id,
        groupId: invitation.groupId,
      });
    }

    return sendCreated(res, invitation, "Invitation sent");
  } catch (error) {
    next(error);
  }
};

export const getMyInvitationsController = async (req, res, next) => {
  try {
    const invitations = await getMyInvitations(req.user._id);
    return sendSuccess(res, invitations, "Invitations retrieved");
  } catch (error) {
    next(error);
  }
};

export const respondToInvitationController = async (req, res, next) => {
  try {
    const result = await respondToInvitation({
      invitationId: req.params.id,
      requestingUserId: req.user._id,
      accept: req.body.accept === true,
      ipAddress: req.ip,
    });

    // If accepted, notify group admin(s) in real time
    if (result.accepted && result.groupId) {
      const io = req.app.get("io");
      if (io) {
        io.to(String(result.adminId ?? result.groupId)).emit(
          "groupMemberAdded",
          {
            groupId: result.groupId,
            userId: req.user._id,
          },
        );
      }
    }

    return sendSuccess(
      res,
      result,
      result.accepted ? "Invitation accepted" : "Invitation declined",
    );
  } catch (error) {
    next(error);
  }
};

export const cancelInvitationController = async (req, res, next) => {
  try {
    const result = await cancelInvitation({
      invitationId: req.params.id,
      requestingUserId: req.user._id,
      ipAddress: req.ip,
    });
    return sendSuccess(res, null, result.message || "Invitation cancelled");
  } catch (error) {
    next(error);
  }
};
