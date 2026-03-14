import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import reminderRoutes from "./routes/reminderRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import invitationRoutes from "./routes/invitationRoutes.js";

import { createServer } from "http";

import { Server } from "socket.io";
import { startReminderScheduler } from "./utils/startReminderScheduler.js";

// security middleware
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
// import mongoSanitize from "express-mongo-sanitize";
// import xss from "xss-clean";
import cookieParser from "cookie-parser";

// ──────────────────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);
dotenv.config();
const versionPrefix = process.env.versionPrefix;

// ─── Socket.io Setup ──────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  },
});

// middleware
// ----- Security Middleware -----
app.use(helmet());
app.use(cookieParser());

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

// app.use(mongoSanitize());
// app.use(xss());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
});
app.use(limiter);

// --------------------------------

app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();

  console.log("------------- REQUEST -------------");
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  console.log("Params:", req.params);
  console.log("Query:", req.query);

  res.on("finish", () => {
    const duration = Date.now() - start;

    console.log("------------- RESPONSE ------------");
    console.log("Status:", res.statusCode);
    console.log("Response Time:", duration + "ms");
    console.log("-----------------------------------\n");
  });

  next();
});

app.use(`${versionPrefix}/auth`, authRoutes);
app.use(`${versionPrefix}/users`, userRoutes);
app.use(`${versionPrefix}/groups`, groupRoutes);
app.use(`${versionPrefix}/invitations`, invitationRoutes);
app.use(`${versionPrefix}/reminders`, reminderRoutes);
app.use(`${versionPrefix}/notifications`, notificationRoutes);
app.use(`${versionPrefix}/activity`, activityRoutes);

app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

// ------- Server ----------

connectDB().then(() => {
  startReminderScheduler(io);

  httpServer.listen(process.env.PORT || 5000, () => {
    console.log(`[Server] Running on PORT ${process.env.PORT || 5000} ✅`);
  });
});
