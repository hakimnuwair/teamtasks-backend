/**
 * models/Reminder.js
 *
 * Added: userCompletions — per-user completion tracking for group reminders.
 * Each entry records when a specific user marked this reminder complete.
 *
 * Why: Group reminders are personal actions even in a team context.
 * User A completing "Daily standup" should not affect User B's status.
 * The top-level status/completedAt remain for personal reminders and
 * for backward compatibility — they reflect the creator's completion.
 *
 * assignedUsers: [] (empty array) means "all group members" and is
 * resolved at creation time to the full member list. Stored as ObjectIds.
 */

import mongoose from "mongoose";

const userCompletionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    completedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const reminderSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxLength: 200 },
    description: { type: String, trim: true, maxLength: 1000, default: "" },
    dueDateTime: { type: Date, required: true },
    recurrence: {
      type: String,
      enum: ["NONE", "DAILY", "WEEKLY", "MONTHLY"],
      default: "NONE",
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Per-user completion tracking (group reminders)
    userCompletions: [userCompletionSchema],

    // Top-level status — for personal reminders this is authoritative.
    // For group reminders: COMPLETED when ALL assigned users have completed.
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
    completedAt: { type: Date, default: null },

    notificationSent: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
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
reminderSchema.index({ dueDateTime: 1, status: 1, notificationSent: 1 });
reminderSchema.index({ "userCompletions.userId": 1 });

// Personal reminder uniqueness
reminderSchema.index(
  { title: 1, createdBy: 1 },
  {
    unique: true,
    partialFilterExpression: { groupId: null, status: "PENDING" },
  },
);

// Group reminder uniqueness
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
  if (!this.getOptions()?.includeDeleted) this.where({ isDeleted: false });
});

const Reminder = mongoose.model("Reminder", reminderSchema);
export default Reminder;
