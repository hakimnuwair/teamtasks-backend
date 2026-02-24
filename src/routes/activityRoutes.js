import express from "express";
import * as activityLogController from "../controllers/activityLogController.js";
import { protect } from "../middlewares/authMiddelware.js";

const router = express.Router();

router.use(protect);

// My personal activity timeline
router.get("/", activityLogController.getMyActivityLogs);

export default router;
