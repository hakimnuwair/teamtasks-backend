import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";

const app = express();
dotenv.config();
const versionPrefix = process.env.versionPrefix;

connectDB();

// middleware
app.use(express.json());

app.use(`${versionPrefix}/auth`, authRoutes);
app.use(`${versionPrefix}/users`, userRoutes);

app.get("/api/v1/home", (req, res) => {
  res.send("hellow world!!");
});

app.listen(process.env.PORT, () => {
  console.log(`server started on PORT ${process.env.PORT}`);
});

// mongodb+srv://hakimnuwaira_db_user:TSdEUNGKu5T6rbOH@cluster0.q9aafx7.mongodb.net/?appName=Cluster0
