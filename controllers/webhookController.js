// controllers/webhookController.js
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
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
};

export const webhookHandler = async (req, res) => {
  const body = req.body;
  if (body.object !== "page") return res.sendStatus(404);

  try {
    for (const entry of body.entry) {
      const fbPageId = entry.id;

      // 1) Find our internal page + user (multi-tenant)
      const [pageRows] = await pool.execute(
        `SELECT p.id, p.user_id, p.page_id, p.page_name, p.access_token
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

      // 2) FEED comment events
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === "feed" && change.value?.item === "comment") {
            const comment = change.value; // FB payload shape
            const commenterId = comment.from?.id; // PSID of commenter (may be null in some cases)
            const commentText = comment.message || "";
            const commentId = comment.comment_id;

            // 2a) Store raw comment
            const [ins] = await pool.execute(
              `INSERT INTO fb_comments (page_id, comment_id, commenter_name, comment_text)
               VALUES (?, ?, ?, ?)`,
              [page.id, commentId, comment.from?.name || null, commentText]
            );
            const fbCommentDbId = ins.insertId;

            // 3) Retrieve context (RAG)
            const top = await searchTopK(page.user_id, commentText, 5);

            // 4) Generate reply
            const replyText = await generateReply({
              businessName: page.page_name || "our business",
              customerText: commentText,
              contextSnippets: top,
            });

            // 5) DM the commenter (only if we have a PSID)
            let status = "pending";
            try {
              if (commenterId) {
                await sendDMWithToken(page.access_token, commenterId, replyText);
                status = "sent";
              } else {
                status = "failed"; // cannot DM without PSID
              }
            } catch (e) {
              console.error("❌ DM error:", e.message);
              status = "failed";
            }

            // 6) Log reply status
            await pool.execute(
              `INSERT INTO replies (comment_id, reply_text, status, sent_at)
               VALUES (?, ?, ?, CASE WHEN ?='sent' THEN NOW() ELSE NULL END)`,
              [fbCommentDbId, replyText, status, status]
            );

            console.log(`🧠 Replied to comment ${commentId} with status: ${status}`);
          }
        }
      }

      // (Optional) Messenger DMs (if you also want to RAG-reply in DM threads)
      if (entry.messaging) {
        for (const event of entry.messaging) {
          if (event.message?.text) {
            // You can reuse the same RAG pipeline here if desired.
            // (Left out for brevity.)
          }
        }
      }
    }

    res.status(200).send("EVENT_RECEIVED");
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.sendStatus(500);
  }
};
