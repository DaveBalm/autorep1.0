// index.js
import express from "express";
import dotenv from "dotenv";
import { onRequest } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import cors from "cors";

import webhookRoutes from "./routes/webhook.js";
import businessRoutes from "./routes/business.js";
import authRoutes from "./routes/auth.js";

dotenv.config();

// ✅ Initialize Firebase only once
if (!getApps().length) {
  initializeApp();
}

const app = express();
app.use(express.json());

// ✅ Enable CORS
const allowedOrigins = [
  "https://preview--social-smart-reply.lovable.app",
  "http://localhost:3000"
];
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Routes
app.use("/webhook", webhookRoutes);
app.use("/business", businessRoutes);
app.use("/auth", authRoutes);

export const api = onRequest(app);
