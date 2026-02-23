import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reminderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reminder",
      default: null,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    type: {
      type: String,
      enum: ["REMINDER_DUE", "GROUP_INVITE", "REMINDER_ASSIGNED", "SYSTEM"],
      default: "REMINDER_DUE",
    },
    message: {
      type: String,
      required: true,
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
