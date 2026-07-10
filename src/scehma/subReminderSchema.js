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
 */

import { z } from "zod";

export const createSubReminderSchema = z.object({
  body: z.object({
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
  }),
});
