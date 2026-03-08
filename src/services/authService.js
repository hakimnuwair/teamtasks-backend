import User from "../models/User.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateToken.js";
import jwt from "jsonwebtoken";

export const saveUser = async (user) => {
  try {
    const newUser = await User.create({
      name: user.name,
      email: user.email,
      password: user.password,
      role: "USER",
    });

    const userObject = newUser.toObject();
    delete userObject.password;
    return userObject;
  } catch (error) {
    throw error;
  }
};

export const handleRefreshToken = async (refreshToken) => {
  if (!refreshToken) {
    throw new Error("No refresh token");
  }

  const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

  const user = await User.findById(decoded.id).select("+refreshToken");

  if (!user) {
    throw new Error("User not found");
  }

  if (user.refreshToken !== refreshToken) {
    throw new Error("Invalid refresh token");
  }

  return generateAccessToken(user);
};

export const getCurrentUserDetails = async (user) => {
  try {
    const savedUser = await User.findById(user._id).select("-password");

    if (!savedUser) return false;

    return savedUser;
  } catch (error) {
    throw error;
  }
};

export const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    return {
      success: false,
      message: "Invalid email or password",
    };
  }

  if (user.status !== "ACTIVE") {
    return {
      success: false,
      message: "Account is not active",
    };
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    return {
      success: false,
      message: "Invalid email or password",
    };
  }

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

export const handleLogout = async (refreshToken) => {
  if (!refreshToken) return;

  const user = await User.findOne({ refreshToken });

  if (user) {
    user.refreshToken = null;
    await user.save();
  }
};
