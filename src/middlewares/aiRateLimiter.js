import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Stricter, per-user rate limit for routes that call the Gemini API.
 * The global limiter in app.js is a blunt whole-API guard (max:10000/15min)
 * and shouldn't be tightened for every route just because a few call out to
 * a paid, slower external service — this scopes the tighter limit to those.
 *
 * Keyed on the authenticated user (every route this is applied to runs after
 * `protect`), falling back to ipKeyGenerator() for the IPv6-safe shape
 * express-rate-limit v8 requires if req.user is ever unset.
 */
export const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) =>
    req.user?._id?.toString() ?? ipKeyGenerator(req.ip),
  message: {
    success: false,
    message: "Too many AI requests — please wait a bit and try again.",
    code: "AI_RATE_LIMITED",
  },
});
