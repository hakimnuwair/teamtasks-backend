/**
 * utils/apiResponse.js
 *
 * Consistent response helpers for all controllers.
 *
 * Response shapes:
 *   Object payload: { success, message, ...fields }   (Object.assign flat spread)
 *   Array payload:  { success, message, data: [...] }
 *   null payload:   { success, message }
 *   Error:          { success: false, message, code?, errors? }
 *
 * toSafeData() converts any Mongoose Documents to plain objects before
 * JSON serialization — prevents "Converting circular structure to JSON"
 * errors that occur when Documents from transactions still hold a MongoClient ref.
 */

// ─── Serialize helper ─────────────────────────────────────────────────────────

function toSafeData(data) {
  if (data === null || data === undefined) return data;

  // Mongoose Document → plain object (strips session/client references)
  if (typeof data.toObject === "function") return toSafeData(data.toObject());

  // Array — process each element
  if (Array.isArray(data)) return data.map(toSafeData);

  // Plain object — recurse into values to catch nested Mongoose Documents
  if (typeof data === "object" && data.constructor === Object) {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, toSafeData(v)]),
    );
  }

  return data;
}

// ─── Success ──────────────────────────────────────────────────────────────────

export const sendSuccess = (
  res,
  data = null,
  message = "Success",
  statusCode = 200,
) => {
  const safe = toSafeData(data);
  const body = { success: true, message };

  if (safe !== null && safe !== undefined) {
    if (Array.isArray(safe)) {
      body.data = safe;
    } else if (typeof safe === "object") {
      Object.assign(body, safe);
    } else {
      body.data = safe;
    }
  }

  return res.status(statusCode).json(body);
};

export const sendCreated = (res, data, message = "Created successfully") =>
  sendSuccess(res, data, message, 201);

// ─── Error ────────────────────────────────────────────────────────────────────

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
