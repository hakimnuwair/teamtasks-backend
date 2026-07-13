import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    type: {
      type: String,
      enum: ["TASK_DUE", "GROUP_INVITE", "TASK_ASSIGNED", "SYSTEM"],
      default: "TASK_DUE",
    },
    message: {
      type: String,
      required: true,
    },
    // Free-form per-type payload (e.g. invitationId for GROUP_INVITE) — mirrors
    // ActivityLog's metadata field. Without this, Mongoose silently strips any
    // metadata passed on create, breaking anything that reads it back.
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

notificationSchema.index({
  userId: 1,
  isRead: 1,
  isDeleted: 1,
  createdAt: -1,
});

notificationSchema.pre(/^find/, function () {
  if (!this.getOptions()?.includeDeleted) {
    this.where({ isDeleted: false });
  }
});

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
