// controllers/businessController.js
import pool from "../config/db.js";
import { splitIntoChunks } from "../utils/textSplitter.js";
import { saveResourceChunks } from "../services/vectorService.js";

/**
 * POST /business/resources
 * body: { userId, title, resource_type, text }
 */
export const ingestTextResource = async (req, res) => {
  try {
    const { userId, title, resource_type, text } = req.body;
    if (!userId || !text) return res.status(400).json({ error: "userId and text required" });

    const [ins] = await pool.execute(
      `INSERT INTO resources (user_id, title, resource_type)
       VALUES (?, ?, ?)`,
      [userId, title || null, resource_type || "other"]
    );
    const resourceId = ins.insertId;

    const chunks = splitIntoChunks(text);
    await saveResourceChunks(resourceId, chunks);

    res.json({ ok: true, resourceId, chunks: chunks.length });
  } catch (e) {
    console.error("❌ ingestTextResource error:", e);
    res.status(500).json({ error: "ingest failed" });
  }
};
