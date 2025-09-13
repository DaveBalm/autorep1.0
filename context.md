Got it ✅ Thanks for sharing the full **Node.js backend directory** for your **AutoRep bot**.
To keep your developer aligned, we should write a **Context & Architecture Reference Document** that defines:

* **Routing conventions**
* **Security rules**
* **Data flow across layers**
* **Consistent architecture principles**
* **How Firebase + TiDB + Gemini + FB Graph API work together**

Here’s a **comprehensive context doc** your dev can always reference:

---

# 📘 AutoRep Backend – Context & Architecture Reference

## 1. Project Purpose

AutoRep is an **AI-powered Facebook Messenger Bot** that:

* Monitors **comments** on user-linked Facebook Pages.
* Sends **direct messages (DMs)** to commenters.
* Uses **Gemini AI** to continue contextual conversations.
* Stores conversations, business resources, and embeddings in **TiDB**.
* Exposes APIs for **chat logs** and **business uploads**.

---

## 2. High-Level Architecture

```
User → Facebook Page → Webhook (Express/Firebase) 
    → WebhookController → fbService 
    → chatService (Gemini AI + vectorService) 
    → TiDB (chat logs, resources, embeddings)
```

### Components

* **Firebase Functions (index.js)** → Entry point, routes requests, scales serverless.
* **TiDB (config/db.js)** → SQL + Vector search for chats and embeddings.
* **Gemini AI (config/gemini.js)** → LLM for generating responses.
* **FB Graph API (fbService.js)** → Send/receive messages, manage Pages.

---

## 3. Directory Responsibilities

### `index.js`

* Sets up Express app.
* Loads routes.
* Exports Firebase HTTPS function.

### `routes/`

* `webhook.js` → Handles **FB Webhook events** (messages, comments).
* `business.js` → Upload business resources (e.g., FAQs, product docs).
* `chat.js` → Retrieve chat logs from TiDB.

### `controllers/`

* **webhookController.js** → Validate webhook, handle messages/comments.
* **businessController.js** → Accept & preprocess business data, store embeddings.
* **chatController.js** → Query chat logs.

### `services/`

* **fbService.js** → Wrapper for Facebook Graph API (send/receive DMs).
* **chatService.js** → Orchestrates AI replies (Gemini + context).
* **vectorService.js** → Embedding storage + retrieval with TiDB vector search.

### `config/`

* **db.js** → TiDB connection (Pool, SSL, retries).
* **gemini.js** → Gemini client setup (API key from `.env`).

### `utils/`

* **logger.js** → Central logging (console + Firebase logs).
* **textSplitter.js** → Break large documents into chunks for embeddings.

---

## 4. Routing & Naming Conventions

* **Base Path:** `/api/v1/`
* **Route grouping:**

  * `/api/v1/webhook` → Messenger webhook
  * `/api/v1/business` → Upload/manage resources
  * `/api/v1/chat` → Retrieve past chats
* Use **camelCase** for functions, **kebab-case** for URLs.

---

## 5. Security Guidelines

1. **Secrets** stored in `.env`, never in code.
2. **Facebook Verify Token** must match before accepting webhooks.
3. **Webhook requests** must be verified using FB `X-Hub-Signature`.
4. **CORS** restricted to trusted frontends only.
5. **Rate limiting** on public endpoints to prevent abuse.
6. **Firebase IAM** → Only specific service accounts can deploy/update functions.

---

## 6. Data Flow

1. User comments on a Page post → FB sends webhook.
2. `webhookController` validates & routes to `fbService`.
3. `fbService` sends DM to commenter.
4. `chatService` enriches with context → `Gemini` generates reply.
5. Conversation stored in **TiDB** (messages, embeddings, timestamps).
6. Business uploads (FAQs, docs) → `textSplitter` → `vectorService` → TiDB vectors.
7. AI uses embeddings + chat logs for context in replies.

---

## 7. Gemini Integration

* **Summarization**: Converts user docs to embeddings.
* **Conversational AI**: Generates contextual DM replies.
* **Memory retrieval**: Uses TiDB vectors for long-term memory.

---

## 8. DevOps & Consistency Rules

* **Every new route** → must have controller + service.
* **Every DB call** → handled via `config/db.js` (no raw connections).
* **Logs** → all errors go through `utils/logger.js`.
* **AI prompts** → standardized in `chatService.js`.
* **Vector operations** → centralized in `vectorService.js`.

---

✅ This doc ensures your dev maintains **consistent routing, secure webhook handling, and scalable architecture**.


