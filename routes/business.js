// routes/business.js
import express from "express";
import fetch from "node-fetch";
import pool from "../config/db.js";
import { searchTopK } from "../services/vectorService.js";
import { generateReply } from "../services/chatService.js";
import { sendDMWithToken } from "../services/fbService.js";
import { ingestTextResource, semanticSearch } from "../controllers/businessController.js";

const router = express.Router();

/**
 * POST /business/pages/connect
 * Connect FB pages after login
 * - Fetches all managed pages
 * - Stores them in DB
 * - Subscribes each to feed + messages webhooks
 */
router.post("/pages/connect", async (req, res) => {
  try {
    const { userId, userAccessToken } = req.body;
    if (!userId || !userAccessToken) {
      return res.status(400).json({ error: "userId and userAccessToken required" });
    }

    // 1) Fetch managed FB pages
    const pagesResp = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}`
    );
    const pagesData = await pagesResp.json();
    if (!pagesData.data) {
      return res.status(400).json({ error: "Failed to fetch pages", details: pagesData });
    }

    // 2) Store pages in DB + subscribe to webhooks
    for (const page of pagesData.data) {
      await pool.execute(
        `INSERT INTO fb_pages (user_id, page_id, page_name, access_token)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
            page_name = VALUES(page_name),
            access_token = VALUES(access_token)`,
        [userId, page.id, page.name, page.access_token]
      );

      // Subscribe page to webhooks
      await fetch(
        `https://graph.facebook.com/v21.0/${page.id}/subscribed_apps?subscribed_fields=feed,messages&access_token=${page.access_token}`,
        { method: "POST" }
      );
    }

    res.json({ ok: true, pages: pagesData.data });
  } catch (err) {
    console.error("❌ connectPages error:", err);
    res.status(500).json({ error: "Failed to connect pages" });
  }
});

/**
 * GET /business/pages
 * Get all connected FB pages for a user
 */
router.get("/pages", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const [rows] = await pool.query(
      `SELECT id, page_id, page_name, access_token, created_at 
       FROM fb_pages 
       WHERE user_id = ?`,
      [userId]
    );

    res.json({ pages: rows });
  } catch (err) {
    console.error("❌ getPages error:", err);
    res.status(500).json({ error: "Failed to fetch pages" });
  }
});

/**
 * GET /business/resources
 * List all uploaded resources for a user
 */
router.get("/resources", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const [rows] = await pool.query(
      `SELECT id, title, resource_type, file_url AS text, created_at
       FROM resources
       WHERE user_id = ?`,
      [userId]
    );

    res.json({ resources: rows });
  } catch (err) {
    console.error("❌ getResources error:", err);
    res.status(500).json({ error: "Failed to fetch resources" });
  }
});

/**
 * POST /business/resources
 * Upload new text resource
 */
router.post("/resources", ingestTextResource);

/**
 * DELETE /business/resources/:id
 * Delete a resource and its embeddings
 */
router.delete("/resources/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!id || !userId) {
      return res.status(400).json({ error: "resource id and userId required" });
    }

    // Delete vectors first (FK constraint)
    await pool.execute(`DELETE FROM resource_vectors WHERE resource_id = ?`, [id]);

    // Delete the resource itself
    const [result] = await pool.execute(
      `DELETE FROM resources WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Resource not found or not owned by user" });
    }

    res.json({ ok: true, deletedId: id });
  } catch (err) {
    console.error("❌ deleteResource error:", err);
    res.status(500).json({ error: "Failed to delete resource" });
  }
});

/**
 * GET /business/comments
 * Get comments + replies linked to user’s pages
 * Optional: filter by postId
 */
router.get("/comments", async (req, res) => {
  try {
    const { userId, postId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    let sql = `
      SELECT c.id, c.comment_id, c.post_id, c.commenter_name, c.comment_text, c.created_at,
             p.page_name,
             r.reply_text, r.status, r.sent_at
      FROM fb_comments c
      JOIN fb_pages p ON c.page_id = p.page_id
      LEFT JOIN replies r ON c.id = r.comment_id
      WHERE p.user_id = ?
    `;
    const params = [userId];

    if (postId) {
      sql += ` AND c.post_id = ?`;
      params.push(postId);
    }

    sql += ` ORDER BY c.created_at DESC`;

    const [rows] = await pool.query(sql, params);

    res.json({ comments: rows });
  } catch (err) {
    console.error("❌ getComments error:", err);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

/**
 * GET /business/page-comments
 * Fetch live comments from Facebook Graph API (direct)
 * Save them into DB so they also appear in /business/comments
 */
router.get("/page-comments", async (req, res) => {
  try {
    const { pageId } = req.query;
    if (!pageId) return res.status(400).json({ error: "Missing pageId" });

    // 1) Lookup stored page + access token
const [rows] = await pool.query(
  `SELECT user_id, access_token FROM fb_pages WHERE page_id = ? LIMIT 1`,
  [pageId]
);
if (rows.length === 0) {
  return res.status(404).json({ error: "Page not found or not connected" });
}
const userId = rows[0].user_id;
const pageToken = rows[0].access_token;


    // 2) Fetch comments from Graph API
    const fbResp = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/feed?fields=comments{from,message,created_time,id}&access_token=${pageToken}`
    );
    const fbData = await fbResp.json();

    if (!fbData.data) {
      return res.status(400).json({ error: "Failed to fetch comments", details: fbData });
    }

    // 3) Flatten + save comments into DB
    const comments = [];
    for (const post of fbData.data) {
      if (post.comments && post.comments.data) {
        for (const c of post.comments.data) {
          const commentId = c.id;
          const commenterName = c.from?.name || "Unknown";
          const commentText = c.message || "";
          const createdTime = c.created_time;
          const postId = post.id;

          comments.push({
            comment_id: commentId,
            commenter_name: commenterName,
            comment_text: commentText,
            created_time: createdTime,
            post_id: postId,
          });

          // ✅ Store into DB (dedup by comment_id)
          await pool.execute(
            `INSERT INTO fb_comments (user_id, page_id, comment_id, post_id, commenter_name, comment_text, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE comment_text = VALUES(comment_text)`,
            [userId, pageId, commentId, postId, commenterName, commentText, new Date(createdTime)]
          );
        }
      }
    }

    res.json({ comments, saved: comments.length });
  } catch (err) {
    console.error("❌ pageComments error:", err);
    res.status(500).json({ error: "Failed to fetch page comments" });
  }
});


/**
 * GET /business/search
 * Semantic search in user resources
 */
router.get("/search", semanticSearch);


/**
 * GET /business/page-posts
 * List posts for a given page
 */
router.get("/page-posts", async (req, res) => {
  try {
    const { pageId, userId } = req.query;
    if (!pageId || !userId) {
      return res.status(400).json({ error: "pageId and userId required" });
    }

    // Get page access_token from DB
    const [pageRows] = await pool.execute(
      `SELECT access_token FROM fb_pages WHERE page_id = ? AND user_id = ? LIMIT 1`,
      [pageId, userId]
    );
    if (pageRows.length === 0) {
      return res.status(404).json({ error: "Page not found for user" });
    }
    const pageToken = pageRows[0].access_token;

    // Fetch posts from FB Graph API
    const resp = await fetch(
      `https://graph.facebook.com/v23.0/${pageId}/feed?fields=id,message,created_time&access_token=${pageToken}`
    );
    const data = await resp.json();

    if (!data.data) {
      return res.status(400).json({ error: "Failed to fetch posts", details: data });
    }

    res.json({ posts: data.data });
  } catch (err) {
    console.error("❌ getPagePosts error:", err);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

/**
 * POST /business/selected-post
 * Save user’s selected post for monitoring
 */
router.post("/selected-post", async (req, res) => {
  try {
    const { userId, pageId, postId } = req.body;
    if (!userId || !pageId || !postId) {
      return res.status(400).json({ error: "userId, pageId, postId required" });
    }

    await pool.execute(
      `INSERT INTO user_selected_posts (user_id, page_id, post_id, created_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE post_id = VALUES(post_id), created_at = NOW()`,
      [userId, pageId, postId]
    );

    res.json({ ok: true, userId, pageId, postId });
  } catch (err) {
    console.error("❌ saveSelectedPost error:", err);
    res.status(500).json({ error: "Failed to save selected post" });
  }
});



/**
 * GET /business/selected-posts
 * Return all saved posts for a user (latest first)
 */
router.get("/selected-posts", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const [rows] = await pool.execute(
      `SELECT page_id AS pageId, post_id AS postId, created_at AS createdAt
       FROM user_selected_posts
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ posts: rows || [] });
  } catch (err) {
    console.error("❌ getSelectedPosts error:", err);
    res.status(500).json({ error: "Failed to fetch selected posts" });
  }
});


/**
 * GET /business/post-comments
 * Fetch comments for a specific post selected by a user
 */
router.get("/post-comments", async (req, res) => {
  try {
    const { postId, userId } = req.query;
    if (!postId || !userId) {
      return res.status(400).json({ error: "postId and userId required" });
    }

    // Get page access token for this user + post
    const [rows] = await pool.execute(
      `SELECT p.access_token AS accessToken, p.page_id AS pageId
       FROM user_selected_posts usp
       JOIN fb_pages p ON usp.page_id = p.page_id
       WHERE usp.post_id = ? AND usp.user_id = ?
       LIMIT 1`,
      [postId, userId]
    );

    if (rows.length === 0) {
      return res.json({ comments: [] });
    }

    const { accessToken, pageId } = rows[0];

    // Fetch comments from Facebook Graph API
    const resp = await fetch(
      `https://graph.facebook.com/v23.0/${postId}/comments?fields=id,from,message,created_time&access_token=${accessToken}`
    );
    const data = await resp.json();

    if (data.error) {
      console.error("❌ Facebook API error:", data.error);
      return res.status(400).json({ error: "Facebook API error", details: data.error });
    }

    if (!data.data) {
      return res.json({ comments: [] });
    }

    // Insert/update comments in fb_comments
    for (const c of data.data) {
      try {
        await pool.execute(
          `INSERT INTO fb_comments 
             (page_id, user_id, comment_id, post_id, commenter_name, comment_text, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
             comment_text = VALUES(comment_text),
             created_at = VALUES(created_at)`,
          [
            pageId,
            userId,
            c.id,
            postId,
            c.from?.name || "Unknown",
            c.message || "",
            c.created_time ? new Date(c.created_time) : new Date(),
          ]
        );
      } catch (dbErr) {
        console.error("❌ DB insert error:", dbErr, "for comment:", c);
      }
    }

    // Return formatted response
    const formatted = data.data.map((c) => ({
      id: c.id,
      from: { id: c.from?.id || null, name: c.from?.name || "Unknown" },
      message: c.message || "",
      createdTime: c.created_time,
    }));

    res.json({ comments: formatted });
  } catch (err) {
    console.error("❌ getPostComments error:", err);
    res.status(500).json({ error: "Failed to fetch/save comments" });
  }
});

// routes/business.js

/**
 * POST /business/trigger-replies
 * Manually trigger AI replies for comments on selected posts
 */
router.post("/trigger-replies", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });

    // 1) Find selected posts
    const [posts] = await pool.execute(
      `SELECT post_id, page_id 
       FROM user_selected_posts 
       WHERE user_id = ?`,
      [userId]
    );
    if (posts.length === 0) {
      return res.status(400).json({ error: "No selected posts for this user" });
    }

    let replyCount = 0;

    for (const post of posts) {
      // 2) Get all comments for that post without replies
      const [comments] = await pool.execute(
        `SELECT c.*, p.page_name, p.access_token 
         FROM fb_comments c
         JOIN fb_pages p ON c.page_id = p.page_id
         WHERE c.user_id = ? AND c.post_id = ? 
         AND NOT EXISTS (
           SELECT 1 FROM replies r WHERE r.comment_id = c.id
         )`,
        [userId, post.post_id]
      );

      for (const comment of comments) {
        // 3) Context + reply
        const top = await searchTopK(userId, comment.comment_text, 5);
        const replyText = await generateReply({
          businessName: comment.page_name,
          customerText: comment.comment_text,
          contextSnippets: top,
        });

        // 4) Send DM or public reply based on reply_mode
        const [pageRow] = await pool.execute(
          `SELECT reply_mode FROM fb_pages WHERE page_id = ? LIMIT 1`,
          [comment.page_id]
        );
        const replyMode = pageRow[0]?.reply_mode || "dm";

        let status = "pending";
        try {
          if (replyMode === "dm" && comment.commenter_id) {
            await sendDMWithToken(comment.access_token, comment.commenter_id, replyText);
            status = "sent";
          } else {
            await fetch(
              `https://graph.facebook.com/v23.0/${comment.comment_id}/comments?access_token=${comment.access_token}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: replyText }),
              }
            );
            status = "sent";
          }
        } catch (e) {
          status = "failed";
        }

        // 5) Save reply
        await pool.execute(
          `INSERT INTO replies (comment_id, reply_text, status, sent_at)
           VALUES (?, ?, ?, CASE WHEN ?='sent' THEN NOW() ELSE NULL END)`,
          [comment.id, replyText, status, status]
        );

        replyCount++;
      }
    }

    res.json({ ok: true, replies: replyCount });
  } catch (err) {
    console.error("❌ triggerReplies error:", err);
    res.status(500).json({ error: "Failed to trigger replies" });
  }
});


export default router;
