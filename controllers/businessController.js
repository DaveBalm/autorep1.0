// controllers/businessController.js
import pool from "../config/db.js";
import { splitIntoChunks } from "../utils/textSplitter.js";
import { saveResourceChunks, searchTopK } from "../services/vectorService.js";

/**
 * POST /business/resources
 * body: { userId, title, resource_type, text }
 */
export const ingestTextResource = async (req, res) => {
  try {
    const { userId, title, resource_type, text } = req.body;
    if (!userId || !text) {
      return res.status(400).json({ error: "userId and text required" });
    }

    // Insert into DB, save text into file_url column
    const [ins] = await pool.execute(
      `INSERT INTO resources (user_id, title, resource_type, file_url)
       VALUES (?, ?, ?, ?)`,
      [userId, title || null, resource_type || "other", text]
    );
    const resourceId = ins.insertId;

    // Split text into chunks and embed
    const chunks = splitIntoChunks(text);
    await saveResourceChunks(resourceId, chunks);

    res.status(201).json({ ok: true, resourceId, chunks: chunks.length });
  } catch (e) {
    console.error("❌ ingestTextResource error:", e);
    res.status(500).json({ error: "ingest failed" });
  }
};




/**
 * GET /business/search
 */
export const semanticSearch = async (req, res) => {
  try {
    const { userId, query, topN } = req.query;
    if (!userId || !query) return res.status(400).json({ error: "Missing userId or query" });

    const results = await searchTopK(userId, query, parseInt(topN) || 5);
    res.json({ results });
  } catch (e) {
    console.error("❌ semanticSearch error:", e);
    res.status(500).json({ error: "search failed" });
  }
};