/**
 * schema/subReminderSchema.js
 *
 * Zod schemas for sub-reminder request validation.
 * Follows the exact same structure as groupReminderSchema.js:
 *   - Wraps validation in { body: z.object({...}) }
 *   - Used by zodValidation middleware
 *
 * Sub-reminders do NOT accept:
 *   - groupId      (inherited from parent)
 *   - assignedUsers (inherited from parent)
 *   - recurrence   (sub-reminders don't recur)
 *
 * subReminderFieldsSchema holds the per-item field rules, shared by:
 *   - createSubReminderSchema (single manual create)
 *   - batchCreateSubRemindersSchema (AI-review confirm — array of items)
 *   - server-side re-validation of raw Gemini output (subReminderService.js)
 */

import { z } from "zod";

export const subReminderFieldsSchema = z.object({
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

export const createSubReminderSchema = z.object({
  body: subReminderFieldsSchema,
});

export const batchCreateSubRemindersSchema = z.object({
  body: z.object({
    subReminders: z
      .array(subReminderFieldsSchema)
      .min(1, "At least one sub-reminder is required")
      .max(10, "Too many sub-reminders — max 10 per batch"),
  }),
});
