import express from "express";
import { getAllUsers } from "../controllers/userController.js";
import { protect } from "../middlewares/authMiddelware.js";
import { authorize } from "../middlewares/roleMiddleware.js";

const router = express.Router();

router.get("/", protect, authorize("ADMIN"), getAllUsers);

export default router;
