/**
 * controllers/authController.js
 *
 * Handles: register, login, logout, token refresh, /me, forgot password, reset password.
 * All responses use consistent apiResponse helpers.
 * User objects are normalized (id string at top level) before sending.
 */

import * as authService from "../services/authService.js";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendUnauthorized,
  sendNotFound,
} from "../utils/apiResponse.js";

// Ensures user.id is always a plain string — lean() returns ObjectId
const normalizeUser = (user) => {
  if (!user) return user;
  const obj =
    typeof user.toObject === "function" ? user.toObject() : { ...user };
  obj.id = String(obj._id ?? obj.id ?? "");
  return obj;
};

export const registerUser = async (req, res, next) => {
  try {
    const user = await authService.saveUser(req.body);
    return sendCreated(
      res,
      normalizeUser(user),
      "Account created successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const refreshAccessToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken)
      return sendUnauthorized(res, "No refresh token provided");
    const accessToken = await authService.handleRefreshToken(refreshToken);
    return sendSuccess(res, { accessToken }, "Token refreshed");
  } catch (error) {
    next(error);
  }
};

export const getMyAuthDetails = async (req, res, next) => {
  try {
    const user = await authService.getCurrentUserDetails(req.user);
    if (!user) return sendNotFound(res, "User not found");
    return sendSuccess(res, normalizeUser(user), "User details retrieved");
  } catch (error) {
    next(error);
  }
};

export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const response = await authService.loginUser({ email, password });
    if (!response.success) {
      return sendError(res, response.message, 401, "INVALID_CREDENTIALS");
    }
    const { accessToken, refreshToken, user } = response.data;
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return sendSuccess(
      res,
      { accessToken, user: normalizeUser(user) },
      "Login successful",
    );
  } catch (error) {
    next(error);
  }
};

export const logoutUser = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    await authService.handleLogout(refreshToken);
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
    return sendSuccess(res, null, "Logged out successfully");
  } catch (error) {
    next(error);
  }
};

// POST /auth/forgot-password  { email }
// Returns success message always (prevents email enumeration).
// In development, also returns resetToken for testing without email setup.
export const forgotPassword = async (req, res, next) => {
  try {
    const result = await authService.requestPasswordReset(req.body.email);
    return sendSuccess(res, result, result.message);
  } catch (error) {
    next(error);
  }
};

// POST /auth/reset-password  { token, newPassword }
export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const result = await authService.resetPassword(token, newPassword);
    return sendSuccess(res, null, result.message);
  } catch (error) {
    next(error);
  }
};
