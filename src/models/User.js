/**
 * models/User.js
 *
 * User schema with:
 * - Optional password (OAuth users use oauth_ placeholder)
 * - Google OAuth: googleId field
 * - Password reset: resetPasswordToken (hashed), resetPasswordExpiry
 * - refreshToken for JWT rotation
 */

import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      minLength: 8,
      select: false,
      // Not required globally — OAuth users have no real password
    },
    googleId: {
      type: String,
      default: null,
    },
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "DELETED"],
      default: "ACTIVE",
    },
    refreshToken: {
      type: String,
      select: false,
    },
    // Password reset — token stored as SHA-256 hash, never plain
    resetPasswordToken: {
      type: String,
      select: false,
      default: null,
    },
    resetPasswordExpiry: {
      type: Date,
      select: false,
      default: null,
    },
  },
  { timestamps: true },
);

// Hash password on create/change; skip OAuth placeholder values
userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) return;
  if (this.password.startsWith("oauth_")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function (enteredPassword) {
  if (!this.password) return false;
  return bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;
