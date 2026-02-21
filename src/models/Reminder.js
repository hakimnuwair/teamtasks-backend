import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxLength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxLength: 1000,
      default: "",
    },
    dueDateTime: {
      type: Date,
      required: true,
    },
    recurrence: {
      type: String,
      enum: ["NONE", "DAILY", "WEEKLY", "MONTHLY"],
      default: "NONE",
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null, // null = personal reminder
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "OVERDUE"],
      default: "PENDING",
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "MEDIUM",
    },
    completedAt: {
      type: Date,
      default: null,
    },
    notificationSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Indexes
reminderSchema.index({ assignedUsers: 1 });
reminderSchema.index({ groupId: 1 });
reminderSchema.index({ createdBy: 1 });
reminderSchema.index({ dueDateTime: 1, status: 1, notificationSent: 1 }); // for scheduler

const Reminder = mongoose.model("Reminder", reminderSchema);
export default Reminder;
