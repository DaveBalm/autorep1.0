// services/vectorService.js
import pool from "../config/db.js";
import { embeddingModel } from "../config/gemini.js";

/** Get embedding for a single string */
export async function embedText(text) {
  const result = await embeddingModel.embedContent({ content: text });
  return result.embedding.values; // Float32[]
}

/** Save chunks + embeddings for a resource */
export async function saveResourceChunks(resourceId, chunks) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const content of chunks) {
      const embedding = await embedText(content);
      await conn.execute(
        `INSERT INTO resource_vectors (resource_id, content, embedding)
         VALUES (?, ?, ?)`,
        [resourceId, content, JSON.stringify(embedding)]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** Cosine similarity (arrays of equal length) */
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

/** Vector search across a user's resources (topK) */
export async function searchTopK(userId, query, topK = 5) {
  const qEmb = await embedText(query);

  // Pull a manageable candidate set (optimize later w/ TiDB VECTOR index)
  const [rows] = await pool.execute(
    `SELECT rv.id, rv.resource_id, rv.content, rv.embedding
     FROM resource_vectors rv
     JOIN resources r ON r.id = rv.resource_id
     WHERE r.user_id = ?
     ORDER BY rv.id DESC
     LIMIT 500`,
    [userId]
  );

  const scored = rows.map(r => {
    const emb = JSON.parse(r.embedding);
    return { ...r, score: cosine(qEmb, emb) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(({ id, resource_id, content, score }) => ({ id, resource_id, content, score }));
}
