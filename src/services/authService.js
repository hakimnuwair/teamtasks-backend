/**
 * services/authService.js
 *
 * Auth service — handles all authentication business logic.
 * Includes: register, login, token refresh, logout, profile retrieval,
 * forgot password (token generation), reset password (token verification).
 *
 * Password reset flow:
 *   1. requestPasswordReset(email) — generates a crypto token, stores hashed
 *      version in DB with 1-hour expiry, returns plain token for email delivery.
 *   2. resetPassword(token, newPassword) — verifies token against stored hash,
 *      updates password, clears reset fields.
 *
 * Email delivery: In production, pass the plain token to your email service.
 * In development, the token is returned in the API response for easy testing.
 */

import crypto from "crypto";
import User from "../models/User.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateToken.js";
import jwt from "jsonwebtoken";
import { sendPasswordResetEmail } from "../utils/sendEmail.js";

// ─── Register ─────────────────────────────────────────────────────────────────

export const saveUser = async (user) => {
  const newUser = await User.create({
    name: user.name,
    email: user.email,
    password: user.password,
    role: "USER",
  });
  const obj = newUser.toObject();
  delete obj.password;
  delete obj.refreshToken;
  return obj;
};

// ─── Login ────────────────────────────────────────────────────────────────────

export const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email }).select("+password");
  if (!user) return { success: false, message: "Invalid email or password" };
  if (user.status !== "ACTIVE")
    return { success: false, message: "Account is not active" };

  const isMatch = await user.comparePassword(password);
  if (!isMatch) return { success: false, message: "Invalid email or password" };

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = refreshToken;
  await user.save();

  return {
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    },
  };
};

// ─── Refresh token ────────────────────────────────────────────────────────────

export const handleRefreshToken = async (refreshToken) => {
  if (!refreshToken) throw new Error("No refresh token");

  const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(decoded.id).select("+refreshToken");
  if (!user) throw new Error("User not found");
  if (user.refreshToken !== refreshToken)
    throw new Error("Invalid refresh token");

  return generateAccessToken(user);
};

// ─── Logout ───────────────────────────────────────────────────────────────────

export const handleLogout = async (refreshToken) => {
  if (!refreshToken) return;
  const user = await User.findOne({ refreshToken }).select("+refreshToken");
  if (user) {
    user.refreshToken = null;
    await user.save();
  }
};

// ─── Current user ─────────────────────────────────────────────────────────────

export const getCurrentUserDetails = async (user) => {
  // .lean() returns a plain object — avoids Mongoose internals ($__, _doc) in JSON
  return User.findById(user._id).select("-password -refreshToken").lean();
};

// ─── Forgot password — step 1: generate token ────────────────────────────────

export const requestPasswordReset = async (email) => {
  const user = await User.findOne({ email, status: "ACTIVE" });
  if (!user) {
    return {
      message: "If that email is registered, a reset link has been sent.",
    };
  }

  if (user.googleId && (!user.password || user.password.startsWith("oauth_"))) {
    return {
      message: "This account uses Google sign-in. Please sign in with Google.",
    };
  }

  const plainToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto
    .createHash("sha256")
    .update(plainToken)
    .digest("hex");

  user.resetPasswordToken = hashedToken;
  user.resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  // ✅ Actually send the email now
  await sendPasswordResetEmail(email, plainToken);

  const isDev = process.env.NODE_ENV !== "production";
  return {
    message: "If that email is registered, a reset link has been sent.",
    // ...(isDev && { resetToken: plainToken, expiresIn: "1 hour" }),
  };
};

// ─── Reset password — step 2: verify token + set new password ────────────────

export const resetPassword = async (plainToken, newPassword) => {
  if (!plainToken) throw new Error("Reset token is required");
  if (!newPassword) throw new Error("New password is required");
  if (newPassword.length < 8)
    throw new Error("Password must be at least 8 characters");

  // Hash the incoming token to compare against stored hash
  const hashedToken = crypto
    .createHash("sha256")
    .update(plainToken)
    .digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpiry: { $gt: new Date() }, // not expired
  }).select("+password +resetPasswordToken +resetPasswordExpiry");

  if (!user) throw new Error("Reset token is invalid or has expired");

  // Set new password and clear reset fields
  user.password = newPassword; // pre-save hook hashes it
  user.resetPasswordToken = null;
  user.resetPasswordExpiry = null;
  user.refreshToken = null; // invalidate all existing sessions
  await user.save();

  return {
    message:
      "Password reset successfully. Please sign in with your new password.",
  };
};
