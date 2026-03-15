/**
 * middlewares/errorHandler.js
 *
 * Global Express error handler. Mount LAST in server.js:
 *   app.use(errorHandler);
 *
 * All errors thrown from controllers land here via next(err).
 * Converts every error — Mongoose, Zod, JWT, custom — to the
 * standard { success: false, message, code, errors? } shape.
 */

export const errorHandler = (err, req, res, next) => {
  console.error("[ErrorHandler]", err);

  // Already responded (streaming etc.)
  if (res.headersSent) return next(err);

  // ── Mongoose validation error ──────────────────────────────────────────────
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      errors,
    });
  }

  // ── Mongoose duplicate key ─────────────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] ?? "field";
    return res.status(409).json({
      success: false,
      message: `${field.charAt(0).toUpperCase() + field.slice(1)} is already taken`,
      code: "DUPLICATE_KEY",
    });
  }

  // ── Mongoose cast error (invalid ObjectId) ────────────────────────────────
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format",
      code: "INVALID_ID",
    });
  }

  // ── JWT errors ────────────────────────────────────────────────────────────
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid or malformed token",
      code: "INVALID_TOKEN",
    });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token has expired",
      code: "TOKEN_EXPIRED",
    });
  }

  // ── Zod validation errors (if thrown directly) ────────────────────────────
  if (err.name === "ZodError") {
    const errors = err.issues?.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      errors,
    });
  }

  // ── Custom app errors ─────────────────────────────────────────────────────
  // Controllers throw new Error("message") — derive status from message content
  if (err instanceof Error) {
    const m = err.message ?? "An unexpected error occurred";
    const ml = m.toLowerCase();
    const status = ml.includes("not found")
      ? 404
      : ml.includes("denied")
        ? 403
        : ml.includes("only")
          ? 403
          : ml.includes("unauthorized")
            ? 401
            : ml.includes("already")
              ? 409
              : ml.includes("invalid")
                ? 400
                : ml.includes("expired")
                  ? 400
                  : ml.includes("incorrect")
                    ? 400
                    : 500;

    return res.status(status).json({ success: false, message: m });
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  res.status(500).json({
    success: false,
    message: "An unexpected error occurred",
    code: "INTERNAL_ERROR",
  });
};
