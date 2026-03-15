/**
 * utils/apiResponse.js
 *
 * Centralized response helpers. Every controller uses these so the
 * frontend can rely on a single shape for EVERY response.
 *
 * SUCCESS shape:
 *   { success: true, message, data?, [resourceKey]?, pagination? }
 *
 * ERROR shape:
 *   { success: false, message, code?, errors? }
 *
 * Rules:
 *  - message is ALWAYS a human-readable string (never undefined)
 *  - code is a short machine-readable string for the frontend to key on
 *  - errors is an array of field-level validation errors (Zod etc.)
 */

// ─── Success ──────────────────────────────────────────────────────────────────

/**
 * sendSuccess(res, data, message?, statusCode?)
 * data can be an object OR a pre-shaped { [key]: [...], pagination }
 */
export const sendSuccess = (
  res,
  data = null,
  message = "Success",
  statusCode = 200,
) => {
  const body = { success: true, message };
  if (data !== null) {
    // If data has a top-level key that is an array (paginated list), spread it
    if (data && typeof data === "object" && !Array.isArray(data)) {
      Object.assign(body, data);
    } else {
      body.data = data;
    }
  }
  return res.status(statusCode).json(body);
};

export const sendCreated = (res, data, message = "Created successfully") =>
  sendSuccess(res, data, message, 201);

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * sendError(res, message, statusCode?, code?, errors?)
 *
 * @param {string}   message    Human-readable description
 * @param {number}   statusCode HTTP status (default 500)
 * @param {string}   code       Machine-readable error key (e.g. "ALREADY_MEMBER")
 * @param {array}    errors     Field-level errors [{ field, message }]
 */
export const sendError = (
  res,
  message,
  statusCode = 500,
  code = null,
  errors = null,
) => {
  const body = { success: false, message };
  if (code) body.code = code;
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

// Convenience aliases
export const sendNotFound = (res, msg = "Resource not found") =>
  sendError(res, msg, 404, "NOT_FOUND");
export const sendForbidden = (res, msg = "Access denied") =>
  sendError(res, msg, 403, "FORBIDDEN");
export const sendUnauthorized = (res, msg = "Authentication required") =>
  sendError(res, msg, 401, "UNAUTHORIZED");
export const sendBadRequest = (res, msg = "Invalid request") =>
  sendError(res, msg, 400, "BAD_REQUEST");
export const sendConflict = (res, msg = "Resource already exists") =>
  sendError(res, msg, 409, "CONFLICT");

// ─── Error code map — turns common error messages into HTTP codes ─────────────
export const httpCodeFromMessage = (message) => {
  const m = message?.toLowerCase() ?? "";
  if (m.includes("not found")) return 404;
  if (m.includes("denied") || m.includes("only")) return 403;
  if (m.includes("unauthorized")) return 401;
  if (m.includes("already") || m.includes("exists")) return 409;
  if (m.includes("invalid") || m.includes("expired") || m.includes("incorrect"))
    return 400;
  return 500;
};
