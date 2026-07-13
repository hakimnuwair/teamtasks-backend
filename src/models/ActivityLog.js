/**
 * models/ActivityLog.js
 */

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
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
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

        // Task actions
        "TASK_CREATED",
        "TASK_UPDATED",
        "TASK_DELETED",
        "TASK_COMPLETED",
        "TASK_OVERDUE",

        // Sub-task actions
        "SUBTASK_CREATED",
        "SUBTASK_DELETED",
      ],
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ groupId: 1, createdAt: -1 });
activityLogSchema.index({ taskId: 1 });

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
export default ActivityLog;
