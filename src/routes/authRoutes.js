import express from "express";
import * as authController from "../controllers/authController.js";

const router = express.Router();

router.get("/me", authController.getMyAuthDetails);
router.post("/register", authController.registerUser);

export default router;
