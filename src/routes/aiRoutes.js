import express from "express";
import * as aiController from "../controllers/aiController.js";
import zodValidation from "../middlewares/zodValidation.js";
import { protect } from "../middlewares/authMiddelware.js";
import { improveTaskSchema } from "../scehma/aiSchema.js";

const router = express.Router();

router.use(protect);

router.post(
  "/improve-task",
  zodValidation(improveTaskSchema),
  aiController.improveTask,
);

export default router;
