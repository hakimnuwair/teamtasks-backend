import express from "express";
import * as authController from "../controllers/authController.js";
import zodValidation from "../middlewares/zodValidation.js";
import { loginSchema, registerSchema } from "../scehma/authSchema.js";
import { protect } from "../middlewares/authMiddelware.js";
import { authorize } from "../middlewares/roleMiddleware.js";

const router = express.Router();
router.post(
  "/register",
  zodValidation(registerSchema),
  authController.registerUser,
);

router.post("/refresh-token", authController.refreshAccessToken);
router.get("/me", protect, authorize("ADMIN"), authController.getMyAuthDetails);
router.post("/login", zodValidation(loginSchema), authController.loginUser);
router.post("/logout", protect, authController.logoutUser);

export default router;
