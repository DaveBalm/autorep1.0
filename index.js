// index.js
import express from "express";
import dotenv from "dotenv";
import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";

import webhookRoutes from "./routes/webhook.js";
import businessRoutes from "./routes/business.js";
import authRoutes from "./routes/auth.js";

dotenv.config();
initializeApp();

const app = express();
app.use(express.json());

// Routes
app.use("/webhook", webhookRoutes);
app.use("/business", businessRoutes);
app.use("/auth", authRoutes);

export const api = onRequest(app);
