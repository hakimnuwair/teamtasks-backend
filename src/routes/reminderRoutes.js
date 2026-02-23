import express from "express";
import * as reminderController from "../controllers/reminderController.js";
import zodValidation from "../middlewares/zodValidation.js";
import { protect } from "../middlewares/authMiddelware.js";
import {
  createReminderSchema,
  updateReminderSchema,
} from "../scehma/groupReminderSchema.js";

const router = express.Router();

router.use(protect);

router.post(
  "/",
  zodValidation(createReminderSchema),
  reminderController.createReminder,
);
router.get("/", reminderController.getMyReminders);
router.get("/:id", reminderController.getReminderById);
router.patch(
  "/:id",
  zodValidation(updateReminderSchema),
  reminderController.updateReminder,
);
router.delete("/:id", reminderController.deleteReminder);
router.post("/:id/complete", reminderController.completeReminder);

// GET /groups/:groupId/reminders is handled in groupRoutes via reminderController
export const getGroupRemindersHandler = reminderController.getGroupReminders;

export default router;
