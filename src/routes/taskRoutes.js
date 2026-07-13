/**
 * routes/taskRoutes.js
 */

import express from "express";
import * as taskController from "../controllers/taskController.js";
import * as subTaskController from "../controllers/subTaskController.js";
import zodValidation from "../middlewares/zodValidation.js";
import { protect } from "../middlewares/authMiddelware.js";
import { aiRateLimiter } from "../middlewares/aiRateLimiter.js";
import {
  createTaskSchema,
  updateTaskSchema,
} from "../scehma/groupTaskSchema.js";
import {
  createSubTaskSchema,
  batchCreateSubTasksSchema,
} from "../scehma/subTaskSchema.js";

const router = express.Router();

// All task routes require authentication
router.use(protect);

// ─── Top-level task routes ─────────────────────────────────────────────────────

router.post("/", zodValidation(createTaskSchema), taskController.createTask);
router.get("/", taskController.getMyTasks);
router.get("/:id", taskController.getTaskById);
router.patch(
  "/:id",
  zodValidation(updateTaskSchema),
  taskController.updateTask,
);
router.delete("/:id", taskController.deleteTask);
router.post("/:id/complete", taskController.completeTask);

// ─── Sub-task routes ────────────────────────────────────────────────────────────
// Nested under /:id/sub-tasks so the parent context is always in the URL

// Create a sub-task under a parent
router.post(
  "/:id/sub-tasks",
  zodValidation(createSubTaskSchema),
  subTaskController.createSubTask,
);

// Get all sub-tasks for a parent
router.get("/:id/sub-tasks", subTaskController.getSubTasks);

// Mark a specific sub-task complete
router.post(
  "/:id/sub-tasks/:subId/complete",
  subTaskController.completeSubTask,
);

// Delete a specific sub-task
router.delete("/:id/sub-tasks/:subId", subTaskController.deleteSubTask);

// ─── AI sub-task generation ─────────────────────────────────────────────────────
// generate is pure (Gemini call only, no DB write) — rate-limited since it
// calls a paid external API. batch is the confirm step that actually persists
// a reviewed set of suggestions, validated the same way as a manual create.

router.post(
  "/:id/sub-tasks/generate",
  aiRateLimiter,
  subTaskController.generateSubTasks,
);

router.post(
  "/:id/sub-tasks/batch",
  zodValidation(batchCreateSubTasksSchema),
  subTaskController.createSubTasksBatch,
);

// ─── Re-export for groupRoutes ──────────────────────────────────────────────────
export const getGroupTasksHandler = taskController.getGroupTasks;

export default router;
