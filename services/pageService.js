// services/pageService.js
import pool from "../db.js";

export async function savePage({ userId, pageId, pageName, pageAccessToken }) {
  const sql = `
    INSERT INTO pages (user_id, page_id, page_name, page_access_token)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      page_name = VALUES(page_name),
      page_access_token = VALUES(page_access_token),
      connected_at = CURRENT_TIMESTAMP
  `;
  await pool.query(sql, [userId, pageId, pageName, pageAccessToken]);
}
