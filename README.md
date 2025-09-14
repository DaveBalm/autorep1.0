# AutoRep: Agentic Facebook DM Bot Powered by TiDB Serverless

✨ **Built for the TiDB AgentX Hackathon 2025**  
🧠 Agentic AI | 🤖 Facebook Messenger Bot | 🔍 Vector Search | ⚡ Serverless | 💬 Real Conversations

---

## 🚀 Project Overview

**AutoRep** is an intelligent, multi-step agentic bot designed to help businesses automate Facebook Messenger conversations—from post comment to purchase. Once a business connects their Facebook Page and uploads internal documents, the agent acts like a trained staff member: responding to comments, sending DMs, and sustaining contextual conversations until a lead converts.

The core agentic flow uses **TiDB Serverless** to store and search uploaded content, past chats, and customer messages. It leverages LLMs to personalize conversations and external APIs to interact with users across channels.

---

## 🧩 Workflow Overview

### 🔗 Step-by-Step Agent Chain

1. **Ingest & Embed Business Data**  
   Upload PDFs, FAQs, product details → Embed with OpenAI → Store vectors in TiDB

2. **Monitor Facebook Comments**  
   Listen for comments using Facebook Webhooks → Trigger response workflow

3. **Launch Direct Message Flow**  
   Use OpenAI to generate an informed intro DM → Send via Facebook API

4. **Context-Aware Response Loop**  
   Maintain state using chat history in TiDB → Use vector & full-text search for grounded answers

5. **Take Smart Actions**  
   Suggest next steps (e.g., schedule call, send invoice) → Optionally call external APIs

---

## 🛠 Tech Stack

| Component   | Tech                                             |
|-------------|--------------------------------------------------|
| Database    | TiDB Serverless (vector + full-text)             |
| Embedding   | OpenAI Embeddings API                            |
| Bot Engine  | Node.js + Express                                |
| LLM         | Gemini                                    |
| Frontend    | Facebook Messenger Platform                      |
| Storage     | Supabase / Firebase (for file uploads)           |
| Hosting     | Railway / Vercel / Render (TBD)                  |

---

## 🔍 TiDB Cloud Usage

- **Vector Search:** Embedding-based semantic matching of resources to customer messages
- **Full-Text Search:** Search FAQs, policies, or product info
- **Chat Logs:** Stored for long-term memory and contextual retrieval
- **Bot Actions:** Logged to ensure transparency and reusability.

---
