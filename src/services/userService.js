/**
 * services/userService.js
 *
 * All user-related business logic.
 * Controllers call these functions — no mongoose/DB code in controllers.
 */

import User from "../models/User.js";

// GET /users
export const getAllUsers = async () => {
  return User.find({ status: "ACTIVE" })
    .select("-password -refreshToken")
    .lean();
};

/**
 * Search users by name or email.
 * Excludes the requesting user from results.
 * Used by the invite flow / AsyncUserSelect component.
 */
export const searchUsers = async (query, excludeUserId) => {
  const regex = new RegExp(query, "i");
  return User.find({
    $and: [
      { status: "ACTIVE" },
      { _id: { $ne: excludeUserId } },
      { $or: [{ name: regex }, { email: regex }] },
    ],
  })
    .select("_id name email")
    .limit(10)
    .lean();
};

// GET /users/:id
export const getUserById = async (userId) => {
  return User.findById(userId).select("-password -refreshToken").lean();
};

/**
 * Update a user's profile.
 * Only the user themselves can update their own profile.
 * Allowed fields: name, email, currentPassword + newPassword.
 */
export const updateUser = async (targetId, payload, requestingUserId) => {
  if (String(targetId) !== String(requestingUserId)) {
    throw new Error("Access denied: you can only update your own profile");
  }

  const user = await User.findById(targetId).select("+password");
  if (!user) throw new Error("User not found");

  const { name, email, currentPassword, newPassword } = payload;

  if (name) user.name = name.trim();

  if (email) {
    const exists = await User.findOne({ email, _id: { $ne: targetId } });
    if (exists) throw new Error("Email is already in use");
    user.email = email.toLowerCase().trim();
  }

  if (newPassword) {
    if (!currentPassword) {
      throw new Error("Current password is required to set a new one");
    }
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) throw new Error("Incorrect current password");
    if (newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters");
    }
    user.password = newPassword; // pre-save hook hashes it
  }

  await user.save();

  const result = user.toObject();
  delete result.password;
  delete result.refreshToken;
  return result;
};
