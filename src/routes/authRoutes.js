import express from "express";
import * as authController from "../controllers/authController.js";
import zodValidation from "../middlewares/zodValidation.js";
import { loginSchema, registerSchema } from "../scehma/authSchema.js";

const router = express.Router();
router.post(
  "/register",
  zodValidation(registerSchema),
  authController.registerUser,
);
router.get("/me", authController.getMyAuthDetails);
router.post("/login", zodValidation(loginSchema), authController.loginUser);

export default router;
