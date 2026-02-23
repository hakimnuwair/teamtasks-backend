import express from "express";
import * as groupController from "../controllers/groupController.js";
import zodValidation from "../middlewares/zodValidation.js";
import { protect } from "../middlewares/authMiddelware.js";
import {
  createGroupSchema,
  updateGroupSchema,
  inviteMemberSchema,
  changeMemberRoleSchema,
} from "../scehma/groupReminderSchema.js";
import * as reminderController from "../controllers/reminderController.js";
import { getGroupRemindersHandler } from "./reminderRoutes.js";

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

// Group reminders
// GET /groups/:groupId/reminders is handled in groupRoutes via reminderController
router.get("/:groupId/reminders", getGroupRemindersHandler);

// Group activity logs
router.get("/:id/activity", groupController.getGroupActivityLogs);

export default router;
