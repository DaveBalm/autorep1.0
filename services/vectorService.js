// services/vectorService.js
import pool from "../config/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

/**
 * Generate embedding for a text using Gemini
 */
export async function generateEmbedding(text) {
  const resp = await embeddingModel.embedContent(text);
  return resp.embedding.values; // ✅ array of floats
}

/**
 * Save resource chunks into DB with embeddings
 */
export async function saveResourceChunks(resourceId, chunks) {
  let count = 0;

  for (const chunk of chunks) {
    // 1️⃣ Generate embedding
    const embedding = await generateEmbedding(chunk);

    // 2️⃣ Convert to JSON string
    const embJson = JSON.stringify(embedding);

    // 3️⃣ Validate JSON format (must be an array)
    try {
      const parsed = JSON.parse(embJson);
      if (!Array.isArray(parsed)) {
        throw new Error("Embedding is not a JSON array");
      }
    } catch (err) {
      console.error(`❌ Invalid embedding for chunk: "${chunk.slice(0, 30)}..."`, err.message);
      continue; // skip bad embedding instead of breaking all
    }

    // 4️⃣ Insert into DB
    await pool.execute(
      `INSERT INTO resource_vectors (resource_id, content, embedding)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         content = VALUES(content), 
         embedding = VALUES(embedding)`,
      [resourceId, chunk, embJson]
    );

    count++;
  }

  return count;
}


/**
 * Semantic search: find top K similar chunks for a query
 */
export async function searchTopK(userId, query, k = 5) {
  // 1️⃣ Get query embedding
  const queryEmbedding = await generateEmbedding(query);

  // 2️⃣ Pull all resource vectors for user
  const [rows] = await pool.execute(
    `SELECT rv.id, rv.content, rv.embedding, r.title, r.resource_type
     FROM resource_vectors rv
     JOIN resources r ON rv.resource_id = r.id
     WHERE r.user_id = ?`,
    [userId]
  );

  if (rows.length === 0) return [];

  // 3️⃣ Cosine similarity
  const cosineSim = (a, b) => {
    let dot = 0.0, normA = 0.0, normB = 0.0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  // 4️⃣ Parse embeddings safely
  const scored = rows.map((row) => {
    try {
      const emb = JSON.parse(row.embedding);
      if (!Array.isArray(emb)) throw new Error("Embedding is not an array");

      return {
        content: row.content,
        title: row.title,
        type: row.resource_type,
        score: cosineSim(queryEmbedding, emb),
      };
    } catch (err) {
      console.warn(`⚠️ Skipping row ${row.id}, invalid embedding:`, err.message);
      return null;
    }
  }).filter(Boolean); // remove nulls

  // 5️⃣ Sort by score and return top-K
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}

