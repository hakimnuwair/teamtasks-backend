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

// Indexes
reminderSchema.index({ assignedUsers: 1 });
reminderSchema.index({ groupId: 1 });
reminderSchema.index({ createdBy: 1 });
reminderSchema.index({ dueDateTime: 1, status: 1, notificationSent: 1 }); // for scheduler

// Personal
reminderSchema.index(
  { title: 1, createdBy: 1 },
  {
    unique: true,
    partialFilterExpression: {
      groupId: null,
      status: "PENDING",
    },
  },
);

// Group
reminderSchema.index(
  { title: 1, groupId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      groupId: { $type: "objectId" },
      status: "PENDING",
    },
  },
);

reminderSchema.pre(/^find/, function () {
  if (!this.getOptions()?.includeDeleted) {
    this.where({ isDeleted: false });
  }
});

const Reminder = mongoose.model("Reminder", reminderSchema);
export default Reminder;
