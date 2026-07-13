/**
 * routes/authRoutes.js
 *
 * Auth routes: register, login, logout, token refresh, /me, Google OAuth,
 * forgot password, reset password.
 */

import express from "express";
import passport from "../config/passport.js";
import * as authController from "../controllers/authController.js";
import zodValidation from "../middlewares/zodValidation.js";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../scehma/authSchema.js";
import { protect } from "../middlewares/authMiddelware.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateToken.js";

const router = express.Router();

// Standard auth
router.post(
  "/register",
  zodValidation(registerSchema),
  authController.registerUser,
);
router.post("/login", zodValidation(loginSchema), authController.loginUser);
router.post("/refresh-token", authController.refreshAccessToken);
router.get("/me", protect, authController.getMyAuthDetails);
router.post("/logout", protect, authController.logoutUser);

// Password reset
router.post(
  "/forgot-password",
  zodValidation(forgotPasswordSchema),
  authController.forgotPassword,
);
router.post(
  "/reset-password",
  zodValidation(resetPasswordSchema),
  authController.resetPassword,
);

// Google OAuth — step 1: redirect to Google consent screen
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    prompt: "select_account",
  }),
);

// Google OAuth — step 2: callback, issue JWT, redirect to frontend
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.CLIENT_URL || "http://localhost:5173"}/login?error=oauth_failed`,
    session: false,
  }),
  async (req, res) => {
    try {
      const user = req.user;
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      user.refreshToken = refreshToken;
      await user.save();

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const clientURL = process.env.CLIENT_URL || "http://localhost:5173";
      res.redirect(
        `${clientURL}/auth/callback?token=${encodeURIComponent(accessToken)}`,
      );
    } catch (err) {
      console.error("[OAuth Callback Error]", err);
      const clientURL = process.env.CLIENT_URL || "http://localhost:5173";
      res.redirect(`${clientURL}/login?error=oauth_error`);
    }
  },
);

export default router;
