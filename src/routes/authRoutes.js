import express from "express";
import * as authController from "../controllers/authController.js";
import zodValidation from "../middlewares/zodValidation.js";
import { loginSchema, registerSchema } from "../scehma/authSchema.js";
import { protect } from "../middlewares/authMiddelware.js";

const router = express.Router();
router.post(
  "/register",
  zodValidation(registerSchema),
  authController.registerUser,
);
router.get("/me", protect, authController.getMyAuthDetails);
router.post("/login", zodValidation(loginSchema), authController.loginUser);

export default router;
