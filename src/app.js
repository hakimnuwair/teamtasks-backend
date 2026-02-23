import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import reminderRoutes from "./routes/reminderRoutes.js";
import notificationRoutes from "./routes/NotificationRoutes.js";
// security middleware
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
// import mongoSanitize from "express-mongo-sanitize";
// import xss from "xss-clean";
import cookieParser from "cookie-parser";

const app = express();
dotenv.config();
const versionPrefix = process.env.versionPrefix;

// middleware
// ----- Security Middleware -----
app.use(helmet());
app.use(cookieParser());

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);

// app.use(mongoSanitize());
// app.use(xss());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
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
app.use(`${versionPrefix}/reminders`, reminderRoutes);
app.use(`${versionPrefix}/notifications`, notificationRoutes);

// ------- Server ----------

connectDB();

app.listen(process.env.PORT, () => {
  console.log(`server started on PORT ${process.env.PORT}`);
});
