/**
 * models/Task.js
 *
 * Tasks support a self-referencing `parentId` (ObjectId ref "Task", default null):
 *   Null  = top-level task
 *   Set   = this is a sub-task of parentId
 * Sub-tasks are 1 level deep only (enforced in the service layer, not here).
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

const taskSchema = new mongoose.Schema(
  {
    // ── Sub-task support ─────────────────────────────────────────────────────
    // null  = this is a top-level task
    // ObjectId = this is a sub-task; value is the parent task's _id
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },

    // ── Core fields ──────────────────────────────────────────────────────────
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

    // Per-user completion tracking (group tasks)
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

// ── Indexes ───────────────────────────────────────────────────────────────────

taskSchema.index({ assignedUsers: 1 });
taskSchema.index({ groupId: 1 });
taskSchema.index({ createdBy: 1 });
taskSchema.index({ dueDateTime: 1, status: 1, notificationSent: 1 });
taskSchema.index({ "userCompletions.userId": 1 });

// Fast lookup of all sub-tasks by parent
taskSchema.index({ parentId: 1 });

// Personal task uniqueness (top-level only — parentId: null)
taskSchema.index(
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

// Group task uniqueness (top-level only — parentId: null)
taskSchema.index(
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

// Pre-find hook — exclude soft-deleted documents
taskSchema.pre(/^find/, function () {
  if (!this.getOptions()?.includeDeleted) this.where({ isDeleted: false });
});

const Task = mongoose.model("Task", taskSchema);
export default Task;
