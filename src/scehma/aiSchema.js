import { z } from "zod";

export const improveTaskSchema = z.object({
  body: z
    .object({
      task: z
        .string({ required_error: "Task is required" })
        .trim()
        .min(3, "Task must be at least 3 characters")
        .max(500, "Task must be at most 500 characters"),
    })
    .strict(),
});
