import express from "express";
import * as notificationController from "../controllers/notificationController.js";
import zodValidation from "../middlewares/zodValidation.js";
import { protect } from "../middlewares/authMiddelware.js";
import { markNotificationsReadSchema } from "../scehma/groupReminderSchema.js";

const router = express.Router();

router.use(protect);

router.get("/", notificationController.getNotifications);
router.patch(
  "/read",
  zodValidation(markNotificationsReadSchema),
  notificationController.markAsRead,
);
router.post("/read-all", notificationController.markAllAsRead);
router.delete("/:id", notificationController.deleteNotification);

export default router;
