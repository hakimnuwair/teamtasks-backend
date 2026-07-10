/**
 * models/Reminder.js
 *
 * Changes from previous version:
 *   - Added `parentId` field (ObjectId ref "Reminder", default null)
 *     Null  = top-level reminder
 *     Set   = this is a sub-reminder of parentId
 *   - Sub-reminders are 1 level deep only (enforced in service layer)
 *   - Pre-find hook is unchanged — parentId: null is the default so
 *     existing queries continue to return only top-level reminders
 *     unless they explicitly filter on parentId
 *
 * Everything else (userCompletions, indexes, soft-delete hook) is unchanged.
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
    // ── Sub-reminder support ────────────────────────────────────────────────
    // null  = this is a top-level reminder
    // ObjectId = this is a sub-reminder; value is the parent reminder's _id
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reminder",
      default: null,
    },

    // ── Core fields (unchanged) ─────────────────────────────────────────────
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
    notifiedUsers: { type: [String], default: [] },

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

// ── Indexes (existing ones preserved, one new index added) ──────────────────

reminderSchema.index({ assignedUsers: 1 });
reminderSchema.index({ groupId: 1 });
reminderSchema.index({ createdBy: 1 });
reminderSchema.index({ dueDateTime: 1, status: 1, notificationSent: 1 });
reminderSchema.index({ "userCompletions.userId": 1 });

// New: fast lookup of all sub-reminders by parent
reminderSchema.index({ parentId: 1 });

// Personal reminder uniqueness (top-level only — parentId: null)
reminderSchema.index(
  { title: 1, createdBy: 1 },
  {
    unique: true,
    partialFilterExpression: {
      groupId: null,
      status: "PENDING",
      parentId: null,
    },
  },
);

// Group reminder uniqueness (top-level only — parentId: null)
reminderSchema.index(
  { title: 1, groupId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      groupId: { $type: "objectId" },
      status: "PENDING",
      parentId: null,
    },
  },
);

// Pre-find hook — exclude soft-deleted documents (unchanged)
reminderSchema.pre(/^find/, function () {
  if (!this.getOptions()?.includeDeleted) this.where({ isDeleted: false });
});

const Reminder = mongoose.model("Reminder", reminderSchema);
export default Reminder;
