/**
 * routes/userRoutes.js — COMPLETE REPLACEMENT
 * Place at: routes/userRoutes.js
 *
 * Added: GET /search, GET /:id, PATCH /:id
 */

import express from "express";
import * as userController from "../controllers/userController.js";
import { protect } from "../middlewares/authMiddelware.js";

const router = express.Router();

router.use(protect);

router.get("/search", userController.searchUsers);
router.get("/", userController.getAllUsers);
router.get("/:id", userController.getUserById);
router.patch("/:id", userController.updateUser);

export default router;
