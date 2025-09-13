Love it — thanks for the clear spec. I’ll align the backend to your **AutoRep Hackathon Workflow** and give you drop-in code that:

* Stores **FB comments → `fb_comments`**
* Runs **RAG** (vector search over business resources)
* Generates a **Gemini** reply
* Sends a **DM** via the Page’s token (multi-tenant)
* Logs the result in **`replies`**

Below are focused updates to your existing structure. Copy/paste per file.

---

# 1) `.env` (add these if missing)

```env
# TiDB
TIDB_HOST=xxx.tidbcloud.com
TIDB_PORT=4000
TIDB_USER=xxx
TIDB_PASSWORD=xxx
TIDB_DATABASE=autorep

# Facebook
FB_APP_ID=...
FB_APP_SECRET=...
FB_VERIFY_TOKEN=some-verify-string

# Gemini
GEMINI_API_KEY=...
```

---

# 2) `config/db.js` (TiDB pool)

```js
// config/db.js
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.TIDB_HOST,
  port: process.env.TIDB_PORT || 4000,
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE,
  ssl: { rejectUnauthorized: true },
  connectionLimit: 8,
});

export default pool;
```

---

# 3) `config/gemini.js` (Gemini client)

```js
// config/gemini.js
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
export const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

export const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];
```

> If you haven’t yet, install:
> `npm i @google/generative-ai mysql2 node-fetch`

---

# 4) `utils/textSplitter.js` (chunking resources)

```js
// utils/textSplitter.js
export function splitIntoChunks(text, maxChars = 1200, overlap = 100) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + maxChars, text.length);
    const chunk = text.slice(i, end).trim();
    if (chunk) chunks.push(chunk);
    i = end - overlap;
    if (i < 0) i = 0;
    if (i >= text.length) break;
  }
  return chunks;
}
```

---

# 5) `services/vectorService.js` (embeddings + simple vector search)

> For hackathon speed, we’ll store embeddings in a TEXT JSON column and compute cosine in Node.
> Later, you can switch to TiDB’s native `VECTOR` type + vector index without changing your controller code.

```js
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
```

---

# 6) `services/fbService.js` (send DM using page-specific token)

```js
// services/fbService.js
import fetch from "node-fetch";

/** Send a Messenger message (DM) using page token */
export async function sendDMWithToken(pageAccessToken, recipientId, text) {
  const url = `https://graph.facebook.com/v20.0/me/messages?access_token=${pageAccessToken}`;
  const body = { recipient: { id: recipientId }, message: { text } };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("❌ FB DM error:", data);
    throw new Error(data?.error?.message || "FB DM failed");
  }
  return data;
}
```

---

# 7) `services/chatService.js` (LLM reply w/ retrieved context)

```js
// services/chatService.js
import { chatModel, safetySettings } from "../config/gemini.js";

/**
 * Generate a short, helpful sales reply.
 * @param {object} params
 * @param {string} params.businessName
 * @param {string} params.customerText
 * @param {Array<{content:string, score:number}>} params.contextSnippets
 */
export async function generateReply({ businessName, customerText, contextSnippets }) {
  const context = contextSnippets
    .map((s, i) => `#${i + 1} (score ${s.score.toFixed(3)}): ${s.content}`)
    .join("\n");

  const prompt = `
You are an on-brand sales assistant for "${businessName}". 
Be concise, friendly, and proactive. If price or availability is in the context, include it. 
Offer one clear next step (e.g., ask for preferred variant, budget, or contact).

Customer: "${customerText}"

Relevant context (ranked):
${context}

Respond in <= 2 short sentences. Avoid emojis unless present in brand tone.
  `.trim();

  const resp = await chatModel.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    safetySettings,
  });

  return resp.response.text().trim();
}
```

---

# 8) `controllers/webhookController.js` (capture comments → RAG → DM → log)

This version:

* Handles **feed comments** (ad comments)
* Looks up the **page access token** from `fb_pages`
* Saves comment → generates reply → DM → logs in `replies`

```js
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
```

---

# 9) `routes/webhook.js` (no change except export names)

```js
// routes/webhook.js
import express from "express";
import { webhookVerify, webhookHandler } from "../controllers/webhookController.js";

const router = express.Router();
router.get("/", webhookVerify);
router.post("/", webhookHandler);
export default router;
```

---

# 10) `controllers/businessController.js` (resource ingest → chunk + embed)

This gives you a simple endpoint to POST raw text (you can extend to file upload later). It:

* Creates a `resources` row
* Splits into chunks
* Embeds and stores in `resource_vectors`

```js
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
```

Add the route:

```js
// routes/business.js
import express from "express";
import { ingestTextResource } from "../controllers/businessController.js";

const router = express.Router();
router.post("/resources", ingestTextResource);
export default router;
```

And mount it in `index.js`:

```js
import businessRoutes from "./routes/business.js";
app.use("/business", businessRoutes);
```

---

# 11) `index.js` (unchanged bootstrapping, mounts routes)

```js
// index.js
import express from "express";
import dotenv from "dotenv";
import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";

import webhookRoutes from "./routes/webhook.js";
import businessRoutes from "./routes/business.js";

dotenv.config();
initializeApp();

const app = express();
app.use(express.json());

app.use("/webhook", webhookRoutes);
app.use("/business", businessRoutes);

export const api = onRequest(app);
```

---

# 12) SQL (aligning to your spec)

If you haven’t created the tables yet (with JSON embeddings for MVP):

```sql
-- users
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- fb_pages (multi-tenant)
CREATE TABLE IF NOT EXISTS fb_pages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  page_id VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  page_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_page (page_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- resources (metadata)
CREATE TABLE IF NOT EXISTS resources (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  title VARCHAR(255),
  file_url TEXT,
  resource_type ENUM('faq','product','discount','other') DEFAULT 'other',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
) CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- resource_vectors (JSON embedding for MVP)
CREATE TABLE IF NOT EXISTS resource_vectors (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  resource_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  embedding JSON NOT NULL,
  FOREIGN KEY (resource_id) REFERENCES resources(id)
) CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- fb_comments
CREATE TABLE IF NOT EXISTS fb_comments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  page_id BIGINT NOT NULL,
  comment_id VARCHAR(255) NOT NULL,
  commenter_name VARCHAR(255),
  comment_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (page_id) REFERENCES fb_pages(id)
) CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- replies (AI reply + DM log)
CREATE TABLE IF NOT EXISTS replies (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  comment_id BIGINT NOT NULL,
  reply_text TEXT NOT NULL,
  status ENUM('pending','sent','failed') DEFAULT 'pending',
  sent_at TIMESTAMP NULL,
  FOREIGN KEY (comment_id) REFERENCES fb_comments(id)
) CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

> When ready to switch to **TiDB VECTOR**: change `embedding JSON` → `embedding VECTOR(768)` and replace searchTopK with SQL ANN queries.

---

## ✅ What you get now

* FB **comments** are captured by `/webhook` and saved to `fb_comments`.
* We **retrieve resource chunks** for the same **user → page** with a quick vector search.
* **Gemini** generates a short, on-brand reply.
* We **DM** the commenter using the **correct page’s** access token (multi-tenant).
* We **log** the outcome in `replies`.

---

Here’s a clean Express route for /auth/facebook/callback that fits your schema:

// routes/auth.js
import express from "express";
import fetch from "node-fetch";
import db from "../db.js"; // your TiDB pool/connection

const router = express.Router();

/**
 * Step 1: User is redirected here from FB OAuth (after login + granting permissions).
 * FB sends ?code=... which we exchange for a User Access Token.
 */
router.get("/facebook/callback", async (req, res) => {
  try {
    const { code, state } = req.query; // state = contains your logged-in user_id
    if (!code || !state) {
      return res.status(400).json({ error: "Missing code or state" });
    }

    const userId = state; // you passed user_id as `state` during FB login redirect

    // ---- 1. Exchange code for short-lived user access token ----
    const tokenResp = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${process.env.FB_APP_ID}&redirect_uri=${process.env.FB_REDIRECT_URI}&client_secret=${process.env.FB_APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) {
      return res.status(400).json({ error: "Failed to get user access token", details: tokenData });
    }
    const userAccessToken = tokenData.access_token;

    // ---- 2. Exchange short-lived for long-lived token ----
    const longTokenResp = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FB_APP_ID}&client_secret=${process.env.FB_APP_SECRET}&fb_exchange_token=${userAccessToken}`
    );
    const longTokenData = await longTokenResp.json();
    if (!longTokenData.access_token) {
      return res.status(400).json({ error: "Failed to get long-lived token", details: longTokenData });
    }
    const longLivedToken = longTokenData.access_token;

    // ---- 3. Get user’s managed pages ----
    const pagesResp = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`
    );
    const pagesData = await pagesResp.json();
    if (!pagesData.data) {
      return res.status(400).json({ error: "Failed to get pages", details: pagesData });
    }

    // ---- 4. Store each page in TiDB ----
    for (const page of pagesData.data) {
      await db.execute(
        `INSERT INTO fb_pages (user_id, page_id, access_token, page_name)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), page_name = VALUES(page_name)`,
        [userId, page.id, page.access_token, page.name]
      );
    }

    return res.redirect("/dashboard?success=facebook_connected");
  } catch (err) {
    console.error("FB Auth Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

🔑 Notes

state parameter = your logged-in users.id (so you know which user owns the FB pages).

The page access tokens you save in fb_pages table are long-lived page tokens, perfect for sending DMs & handling webhooks.

If the user manages multiple pages, we insert/update each one in fb_pages.

ON DUPLICATE KEY UPDATE ensures if they reconnect, it just refreshes token + page name.
