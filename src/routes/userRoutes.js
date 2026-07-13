/**
 * routes/userRoutes.js
 *
 * ROUTE ORDER MATTERS:
 *   /search must be registered before /:id — otherwise Express matches
 *   the string "search" as the :id param and the request hits getUserById,
 *   which tries to cast "search" as a MongoDB ObjectId and throws a 400.
 */

import express from "express";
import * as userController from "../controllers/userController.js";
import { protect } from "../middlewares/authMiddelware.js";
import zodValidation from "../middlewares/zodValidation.js";
import { updateUserSchema } from "../scehma/userSchema.js";

const router = express.Router();

router.use(protect);

// Static routes first
router.get("/search", userController.searchUsers);
router.get("/", userController.getAllUsers);

// Dynamic :id routes last
router.get("/:id", userController.getUserById);
router.patch("/:id", zodValidation(updateUserSchema), userController.updateUser);

export default router;
