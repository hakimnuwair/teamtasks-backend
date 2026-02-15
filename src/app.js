import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
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

app.use(`${versionPrefix}/auth`, authRoutes);
app.use(`${versionPrefix}/users`, userRoutes);

// ------- Server ----------

connectDB();

app.listen(process.env.PORT, () => {
  console.log(`server started on PORT ${process.env.PORT}`);
});
