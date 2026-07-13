/**
 * server.js
 *
 * IMPORTANT ORDER:
 *   dotenv.config() must run before initPassport() — ES module imports are
 *   hoisted, so env vars are not available inside imported modules at load
 *   time. initPassport() is called explicitly here, after dotenv runs.
 */
import express from "express";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import cookieParser from "cookie-parser";
import { initSocket } from "./server/socketManager.js";
import { startTaskScheduler } from "./services/taskScheduler.js";

import { connectDB } from "./config/db.js";
import passport, { initPassport } from "./config/passport.js";
import { errorHandler } from "./middlewares/errorHandler.js";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import invitationRoutes from "./routes/invitationRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";

// ─── MUST be first — before any env var is read ───────────────────────────────
dotenv.config();

// ─── MUST be after dotenv.config() ───────────────────────────────────────────
initPassport();

const app = express();
const httpServer = createServer(app);
const versionPrefix = process.env.versionPrefix || "/api/v1";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// ─── Socket.io ────────────────────────────────────────────────────────────────
const io = initSocket(httpServer);

// Make io available to all controllers via req.app.get("io")
app.set("io", io);

// Every authenticated user joins a room named after their userId.
// This allows io.to(userId).emit(...) to target a specific user.
const socketUserMap = new Map(); // socketId → userId (for debugging)

io.on("connection", (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  socket.on("join", (userId) => {
    const uid = String(userId).trim();
    if (!uid) return;
    socket.join(uid);
    socketUserMap.set(socket.id, uid);
    console.log(`[Socket] User ${uid} joined room (socket: ${socket.id})`);
  });

  socket.on("disconnect", (reason) => {
    const uid = socketUserMap.get(socket.id) ?? "unknown";
    socketUserMap.delete(socket.id);
    console.log(
      `[Socket] Disconnected: ${socket.id} | user: ${uid} | reason: ${reason}`,
    );
  });

  socket.on("error", (err) => {
    console.error(`[Socket] Error on ${socket.id}:`, err);
  });
});

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cookieParser());
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 10000 }));
app.use(express.json());

// Passport — session: false because we use JWT, not server-side sessions
app.use(passport.initialize());

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`→ ${req.method} ${req.originalUrl}`);
  res.on("finish", () => {
    console.log(
      `← ${res.statusCode} ${req.originalUrl} (${Date.now() - start}ms)`,
    );
  });
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use(`${versionPrefix}/auth`, authRoutes);
app.use(`${versionPrefix}/users`, userRoutes);
app.use(`${versionPrefix}/groups`, groupRoutes);
app.use(`${versionPrefix}/invitations`, invitationRoutes);
app.use(`${versionPrefix}/tasks`, taskRoutes);
app.use(`${versionPrefix}/notifications`, notificationRoutes);
app.use(`${versionPrefix}/activity`, activityRoutes);
app.use(`${versionPrefix}/ai`, aiRoutes);

app.get("/health", (_req, res) =>
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() }),
);

// Global error handler — MUST be last middleware
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
connectDB().then(() => {
  startTaskScheduler(io);
  httpServer.listen(process.env.PORT || 5000, () => {
    console.log(`[Server] Running on PORT ${process.env.PORT || 5000} ✅`);
    console.log(`[Server] Socket.io ready`);
    console.log(`[Server] Google OAuth: ${versionPrefix}/auth/google`);
  });
});
