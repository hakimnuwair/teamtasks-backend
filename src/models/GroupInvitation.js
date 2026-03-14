// models/GroupInvitation.js
import mongoose from "mongoose";

/**
 * Tracks pending invitations to a group.
 * Status transitions: PENDING → ACCEPTED | DECLINED | CANCELLED
 */
const groupInvitationSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    invitedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["ADMIN", "MEMBER"],
      default: "MEMBER",
    },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"],
      default: "PENDING",
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  },
  { timestamps: true },
);

// One active invite per user per group at a time
groupInvitationSchema.index(
  { groupId: 1, invitedUser: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "PENDING" },
  },
);

groupInvitationSchema.index({ invitedUser: 1, status: 1 });
groupInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-cleanup

const GroupInvitation = mongoose.model(
  "GroupInvitation",
  groupInvitationSchema,
);
export default GroupInvitation;
