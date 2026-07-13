import express from "express";
import * as groupController from "../controllers/groupController.js";
import zodValidation from "../middlewares/zodValidation.js";
import { protect } from "../middlewares/authMiddelware.js";
import {
  createGroupSchema,
  updateGroupSchema,
  inviteMemberSchema,
  changeMemberRoleSchema,
} from "../scehma/groupTaskSchema.js";
import { getGroupTasksHandler } from "./taskRoutes.js";
import * as invitationService from "../services/invitationService.js";

const router = express.Router();

// All group routes require authentication
router.use(protect);

router.post("/", zodValidation(createGroupSchema), groupController.createGroup);
router.get("/", groupController.getUserGroups);
router.get("/:id", groupController.getGroupById);
router.patch(
  "/:id",
  zodValidation(updateGroupSchema),
  groupController.updateGroup,
);
router.delete("/:id", groupController.deleteGroup);

// Member management
router.post(
  "/:id/invite",
  zodValidation(inviteMemberSchema),
  groupController.inviteMember,
);
router.delete("/:id/members/:userId", groupController.removeMember);
router.patch(
  "/:id/members/role",
  zodValidation(changeMemberRoleSchema),
  groupController.changeMemberRole,
);

// Group tasks
// GET /groups/:groupId/tasks is handled in groupRoutes via taskController
router.get("/:groupId/tasks", getGroupTasksHandler);
router.get("/:groupId/invitations", async (req, res, next) => {
  try {
    const invitations = await invitationService.getSentInvitationsForGroup({
      groupId: req.params.groupId,
      requestingUserId: req.user.id,
    });
    res.json({ success: true, data: invitations });
  } catch (err) {
    next(err);
  }
});

// Group activity logs
router.get("/:id/activity", groupController.getGroupActivityLogs);

export default router;
