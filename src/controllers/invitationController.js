import {
  sendInvitation,
  getMyInvitations,
  respondToInvitation,
  cancelInvitation,
} from "../services/invitationService.js";

// Send invitation
export const sendInvitationController = async (req, res) => {
  try {
    const invitation = await sendInvitation({
      groupId: req.params.groupId,
      requestingUserId: req.user._id,
      email: req.body.email,
      role: req.body.role ?? "MEMBER",
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: invitation,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

// Get my invitations
export const getMyInvitationsController = async (req, res) => {
  try {
    const invitations = await getMyInvitations(req.user._id);

    res.json({
      success: true,
      data: invitations,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// Respond to invitation
export const respondToInvitationController = async (req, res) => {
  try {
    const result = await respondToInvitation({
      invitationId: req.params.id,
      requestingUserId: req.user._id,
      accept: req.body.accept === true,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

// Cancel invitation
export const cancelInvitationController = async (req, res) => {
  try {
    const result = await cancelInvitation({
      invitationId: req.params.id,
      requestingUserId: req.user._id,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};
