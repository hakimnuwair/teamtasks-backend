import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    reminderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reminder",
      default: null,
    },
    action: {
      type: String,
      enum: [
        // Group actions
        "GROUP_CREATED",
        "GROUP_UPDATED",
        "GROUP_DELETED",
        "GROUP_MEMBER_ADDED",
        "GROUP_MEMBER_REMOVED",
        "GROUP_ROLE_CHANGED",

        // Invitation actions
        "GROUP_INVITATION_SENT",
        "GROUP_INVITATION_ACCEPTED",
        "GROUP_INVITATION_DECLINED",
        "GROUP_INVITATION_CANCELLED",

        // Reminder actions
        "REMINDER_CREATED",
        "REMINDER_UPDATED",
        "REMINDER_DELETED",
        "REMINDER_COMPLETED",
        "REMINDER_OVERDUE",
      ],
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed, // Extra context (e.g., old vs new value)
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

// Indexes
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ groupId: 1, createdAt: -1 });
activityLogSchema.index({ reminderId: 1 });

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
export default ActivityLog;
