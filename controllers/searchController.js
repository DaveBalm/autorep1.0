// controllers/searchController.js
import { searchResourceChunks } from "../services/vectorService.js";

/**
 * GET /business/search?userId=123&query=...
 */
export const semanticSearch = async (req, res) => {
  try {
    const { userId, query } = req.query;
    if (!userId || !query) {
      return res.status(400).json({ error: "userId and query required" });
    }

    const results = await searchResourceChunks(userId, query, 5);
    res.json({ results });
  } catch (e) {
    console.error("❌ semanticSearch error:", e);
    res.status(500).json({ error: "semantic search failed" });
  }
};
