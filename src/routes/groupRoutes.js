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

const router = express.Router();

// All group routes require authentication
router.use(protect);

router.post("/", zodValidation(createGroupSchema), groupController.createGroup);
router.get("/", groupController.getUserGroups);
router.get("/:id", groupController.getGroupById);
router.put(
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

// Group activity logs
router.get("/:id/activity", groupController.getGroupActivityLogs);

export default router;
