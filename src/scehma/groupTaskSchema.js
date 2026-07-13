import { z } from "zod";

// ─── GROUP SCHEMAS ────────────────────────────────────────────────────────────

export const createGroupSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: "Group name is required" })
      .trim()
      .min(1, "Group name cannot be empty")
      .max(100, "Group name too long"),

    description: z.string().trim().max(500).optional().default(""),
  }),
});

export const updateGroupSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
  }),
});

export const inviteMemberSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: "Email is required" })
      .email("Invalid email address"),
    role: z.enum(["ADMIN", "MEMBER"]).optional().default("MEMBER"),
  }),
});

export const changeMemberRoleSchema = z.object({
  body: z.object({
    userId: z.string({ required_error: "userId is required" }),
    role: z.enum(["ADMIN", "MEMBER"], {
      required_error: "Role is required",
    }),
  }),
});

// ─── TASK SCHEMAS ─────────────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  body: z.object({
    title: z
      .string({ required_error: "Title is required" })
      .trim()
      .min(1, "Title cannot be empty")
      .max(200),

    description: z.string().trim().max(1000).optional().default(""),

    dueDateTime: z.coerce
      .date({ required_error: "dueDateTime is required" })
      .refine((d) => d > new Date(), {
        message: "dueDateTime must be in the future",
      }),

    recurrence: z
      .enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"])
      .optional()
      .default("NONE"),

    groupId: z.string().optional().nullable().default(null),

    assignedUsers: z.array(z.string()).optional().default([]),

    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional().default("MEDIUM"),
  }),
});

export const updateTaskSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1).max(200).optional(),

    description: z.string().trim().max(1000).optional(),

    dueDateTime: z.coerce
      .date()
      .refine((d) => d > new Date(), {
        message: "dueDateTime must be in the future",
      })
      .optional(),

    recurrence: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).optional(),

    assignedUsers: z.array(z.string()).optional(),

    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),

    status: z.enum(["PENDING", "COMPLETED", "OVERDUE"]).optional(),
  }),
});

// ─── NOTIFICATION SCHEMAS ─────────────────────────────────────────────────────

export const markNotificationsReadSchema = z.object({
  body: z.object({
    notificationIds: z
      .array(z.string(), {
        required_error: "notificationIds array required",
      })
      .min(1, "Provide at least one notification id"),
  }),
});
