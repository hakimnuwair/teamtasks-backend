/**
 * schema/subTaskSchema.js
 *
 * Zod schemas for sub-task request validation.
 * Follows the exact same structure as groupTaskSchema.js:
 *   - Wraps validation in { body: z.object({...}) }
 *   - Used by zodValidation middleware
 *
 * Sub-tasks do NOT accept:
 *   - groupId      (inherited from parent)
 *   - assignedUsers (inherited from parent)
 *   - recurrence   (sub-tasks don't recur)
 *
 * subTaskFieldsSchema holds the per-item field rules, shared by:
 *   - createSubTaskSchema (single manual create)
 *   - batchCreateSubTasksSchema (AI-review confirm — array of items)
 *   - server-side re-validation of raw Gemini output (subTaskService.js)
 */

import { z } from "zod";

export const subTaskFieldsSchema = z.object({
  title: z
    .string({ required_error: "Title is required" })
    .trim()
    .min(1, "Title cannot be empty")
    .max(200, "Title too long"),

  description: z.string().trim().max(1000).optional().default(""),

  dueDateTime: z.coerce
    .date({ required_error: "dueDateTime is required" })
    .refine((d) => d > new Date(), {
      message: "dueDateTime must be in the future",
    }),

  priority: z
    .enum(["LOW", "MEDIUM", "HIGH"], {
      errorMap: () => ({ message: "priority must be LOW, MEDIUM, or HIGH" }),
    })
    .optional()
    .default("MEDIUM"),
});

export const createSubTaskSchema = z.object({
  body: subTaskFieldsSchema,
});

export const batchCreateSubTasksSchema = z.object({
  body: z.object({
    subTasks: z
      .array(subTaskFieldsSchema)
      .min(1, "At least one sub-task is required")
      .max(10, "Too many sub-tasks — max 10 per batch"),
  }),
});
