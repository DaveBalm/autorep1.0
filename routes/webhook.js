// routes/webhook.js
import express from "express";
import { webhookVerify, webhookHandler } from "../controllers/webhookController.js";

const router = express.Router();
router.get("/", webhookVerify);
router.post("/", webhookHandler);
export default router;
