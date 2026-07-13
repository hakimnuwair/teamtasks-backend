import { z } from "zod";

/**
 * Update User Schema — PATCH /users/:id
 * All fields optional (partial update). Service layer enforces that a
 * newPassword requires currentPassword to also be present.
 */
export const updateUserSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, "Name cannot be empty").max(50).optional(),
    email: z.string().trim().email("Invalid email format").optional(),
    currentPassword: z.string().optional(),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(100)
      .optional(),
  }),
});
