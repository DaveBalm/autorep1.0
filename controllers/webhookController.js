// inside webhookHandler.js
import pool from "../config/db.js";
import { searchTopK } from "../services/vectorService.js";
import { generateReply } from "../services/chatService.js";
import { sendDMWithToken } from "../services/fbService.js";

export const webhookVerify = (req, res) => {
  const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

export const webhookHandler = async (req, res) => {
  const body = req.body;
  if (body.object !== "page") return res.sendStatus(404);

  try {
    for (const entry of body.entry) {
      const fbPageId = entry.id;

      // 1) Find page + user + reply mode
      const [pageRows] = await pool.execute(
        `SELECT p.id, p.user_id, p.page_id, p.page_name, p.access_token, p.reply_mode
         FROM fb_pages p
         WHERE p.page_id = ?
         LIMIT 1`,
        [fbPageId]
      );
      const page = pageRows[0];
      if (!page) {
        console.error("❌ No fb_pages row for fbPageId:", fbPageId);
        continue;
      }

      // 2) Handle feed comments
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === "feed" && change.value?.item === "comment") {
            const comment = change.value;
            const commenterId = comment.from?.id || null;
            const commenterName = comment.from?.name || null;
            const commentText = comment.message || "";
            const commentId = comment.comment_id;
            const postId = comment.post_id || null;

            // Only handle tracked posts
            const [postRows] = await pool.execute(
              `SELECT 1 FROM user_selected_posts WHERE post_id = ? AND user_id = ? LIMIT 1`,
              [postId, page.user_id]
            );
            if (postRows.length === 0) {
              console.log(`⚠️ Ignoring comment ${commentId} — post ${postId} not tracked by user ${page.user_id}`);
              continue;
            }

            // Save raw comment
            const [ins] = await pool.execute(
              `INSERT INTO fb_comments (user_id, page_id, comment_id, commenter_name, comment_text, post_id)
               VALUES (?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE comment_text = VALUES(comment_text)`,
              [page.user_id, page.page_id, commentId, commenterName, commentText, postId]
            );
            const fbCommentDbId = ins.insertId;
            console.log(`💾 Saved comment ${commentId} (post: ${postId}) from ${commenterName}`);

            // RAG search
            const top = await searchTopK(page.user_id, commentText, 5);

            // Generate AI reply
            const replyText = await generateReply({
              businessName: page.page_name || "our business",
              customerText: commentText,
              contextSnippets: top,
            });

            // Send reply depending on reply_mode
            let status = "pending";
            try {
              if (page.reply_mode === "dm" && commenterId) {
                await sendDMWithToken(page.access_token, commenterId, replyText);
                status = "sent";
              } else {
                // fallback → public comment reply
                await fetch(
                  `https://graph.facebook.com/v23.0/${commentId}/comments?access_token=${page.access_token}`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: replyText }),
                  }
                );
                status = "sent";
              }
            } catch (e) {
              console.error("❌ Reply error:", e.message);
              status = "failed";
            }

            // Save reply status
            await pool.execute(
              `INSERT INTO replies (comment_id, reply_text, status, sent_at)
               VALUES (?, ?, ?, CASE WHEN ?='sent' THEN NOW() ELSE NULL END)`,
              [fbCommentDbId, replyText, status, status]
            );

            console.log(`🧠 Replied to comment ${commentId} with status: ${status}`);
          }
        }
      }

      // (Optional) Messenger messages
      if (entry.messaging) {
        for (const event of entry.messaging) {
          if (event.message?.text) {
            console.log("💬 Incoming DM:", event.message.text);
            // Could reuse the same logic here
          }
        }
      }
    }

    return res.status(200).send("EVENT_RECEIVED");
  } catch (err) {
    console.error("❌ Webhook error:", err);
    return res.sendStatus(500);
  }
};
