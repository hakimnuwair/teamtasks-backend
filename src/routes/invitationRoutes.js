import express from "express";
import { protect } from "../middlewares/authMiddelware.js";
import zodValidation from "../middlewares/zodValidation.js";
import { inviteMemberSchema } from "../scehma/groupTaskSchema.js";

import {
  sendInvitationController,
  getMyInvitationsController,
  respondToInvitationController,
  cancelInvitationController,
} from "../controllers/invitationController.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// POST /api/groups/:groupId/invite
router.post(
  "/groups/:groupId/invite",
  zodValidation(inviteMemberSchema),
  sendInvitationController,
);

// GET /api/invitations/me
router.get("/me", getMyInvitationsController);

// PATCH /api/invitations/:id/respond
router.patch("/:id/respond", respondToInvitationController);

// PATCH /api/invitations/:id/cancel
router.patch("/:id/cancel", cancelInvitationController);

export default router;
