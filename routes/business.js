// routes/business.js
import express from "express";
import { ingestTextResource } from "../controllers/businessController.js";

const router = express.Router();
router.post("/resources", ingestTextResource);
export default router;
