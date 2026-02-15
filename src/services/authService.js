import User from "../models/User.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateToken.js";

export const saveUser = async (user) => {
  try {
    const newUser = await User.create({
      name: user.name,
      email: user.email,
      password: user.password,
      role: "USER",
    });
    return newUser.save();
  } catch (error) {
    throw error;
  }
};

export const getCurrentUserDetails = async (user) => {
  try {
    const savedUser = await User.findOne({ email: user.email }).select(
      "-password",
    );
    if (!savedUser) return false;

    return savedUser;
  } catch (error) {
    throw error;
  }
};

export const loginUser = async ({ email, password }) => {
  // 1️⃣ Find user
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    return {
      success: false,
      message: "Invalid email or password",
    };
  }

  // 2️⃣ Check account status
  if (user.status !== "ACTIVE") {
    return {
      success: false,
      message: "Account is not active",
    };
  }

  // 3️⃣ Compare password
  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    return {
      success: false,
      message: "Invalid email or password",
    };
  }

  // 4️⃣ Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

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
