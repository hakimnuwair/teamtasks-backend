/**
 * config/passport.js
 *
 * Google OAuth 2.0 strategy via passport-google-oauth20.
 *
 * FIX: GoogleStrategy is now registered lazily inside initPassport(),
 * which is called from server.js AFTER dotenv.config() runs.
 * This prevents the "clientID required" crash that happens when
 * passport.js is imported before env vars are loaded (ES module hoisting).
 *
 * Install: npm install passport passport-google-oauth20
 *
 * .env additions required:
 *   GOOGLE_CLIENT_ID=<from Google Cloud Console>
 *   GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
 *   GOOGLE_CALLBACK_URL=http://localhost:5000/api/v1/auth/google/callback
 *   CLIENT_URL=http://localhost:5173
 */

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js";

/**
 * Call this once in server.js AFTER dotenv.config() so env vars are present.
 *
 * Usage in server.js:
 *   import { initPassport } from "./config/passport.js";
 *   dotenv.config();
 *   initPassport();
 */
export function initPassport() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    console.warn(
      "[Passport] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing. " +
        "Google OAuth will be disabled.",
    );
    return; // Don't crash the server — just skip OAuth registration
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL:
          process.env.GOOGLE_CALLBACK_URL ||
          "http://localhost:5001/api/v1/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email)
            return done(new Error("No email returned from Google"), null);

          let user = await User.findOne({ email });

          if (user) {
            if (user.status === "DELETED") {
              return done(new Error("Account has been deleted"), null);
            }
            if (user.status === "INACTIVE") {
              user.status = "ACTIVE";
              await user.save();
            }
            return done(null, user);
          }

          // New user — no real password needed for OAuth accounts
          // The "oauth_" prefix tells the pre-save hook to skip bcrypt hashing
          const oauthPassword = `oauth_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

          user = await User.create({
            name: profile.displayName || email.split("@")[0],
            email,
            googleId: profile.id,
            password: oauthPassword,
            status: "ACTIVE",
            role: "USER",
          });

          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      },
    ),
  );

  console.log("[Passport] Google OAuth strategy registered ✅");
}

export default passport;
