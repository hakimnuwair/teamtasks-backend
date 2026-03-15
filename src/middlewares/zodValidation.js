/**
 * middlewares/zodValidation.js
 * Validates body, params, and query using Zod
 * Returns consistent API response shape
 */

import { ZodError } from "zod";

const zodValidation = (schema) => {
  return async (req, res, next) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: req.query,
      });

      if (parsed.body) req.body = parsed.body;
      if (parsed.params) req.params = parsed.params;
      if (parsed.query) req.query = parsed.query;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));

        const message = errors[0]?.message ?? "Validation failed";

        return res.status(400).json({
          success: false,
          message,
          code: "VALIDATION_ERROR",
          errors,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  };
};

export default zodValidation;
