/**
 * routes/reminderRoutes.js
 *
 * Changes from previous version:
 *   - Imported subReminderController and createSubReminderSchema
 *   - Added 4 new sub-reminder routes nested under /:id/sub-reminders
 *
 * Everything else (protect, zodValidation, existing reminder routes) is unchanged.
 */

import express from "express";
import * as reminderController from "../controllers/reminderController.js";
import * as subReminderController from "../controllers/subReminderController.js";
import zodValidation from "../middlewares/zodValidation.js";
import { protect } from "../middlewares/authMiddelware.js";
import {
  createReminderSchema,
  updateReminderSchema,
} from "../scehma/groupReminderSchema.js";
import { createSubReminderSchema } from "../scehma/subReminderSchema.js";

const router = express.Router();

// All reminder routes require authentication
router.use(protect);

// ─── Top-level reminder routes (unchanged) ────────────────────────────────────

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

// ─── Sub-reminder routes (NEW) ────────────────────────────────────────────────
// Nested under /:id/sub-reminders so the parent context is always in the URL

// Create a sub-reminder under a parent
router.post(
  "/:id/sub-reminders",
  zodValidation(createSubReminderSchema),
  subReminderController.createSubReminder,
);

// Get all sub-reminders for a parent
router.get("/:id/sub-reminders", subReminderController.getSubReminders);

// Mark a specific sub-reminder complete
router.post(
  "/:id/sub-reminders/:subId/complete",
  subReminderController.completeSubReminder,
);

// Delete a specific sub-reminder
router.delete(
  "/:id/sub-reminders/:subId",
  subReminderController.deleteSubReminder,
);

// ─── Re-export for groupRoutes (unchanged) ────────────────────────────────────
export const getGroupRemindersHandler = reminderController.getGroupReminders;

export default router;
