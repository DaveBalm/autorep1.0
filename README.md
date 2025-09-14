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
| Storage     | TiDB           |
| Hosting     | Goole cloud funtion                 |

---

## 🔍 TiDB Cloud Usage

- **Vector Search:** Embedding-based semantic matching of resources to customer messages
- **Full-Text Search:** Search FAQs, policies, or product info
- **Chat Logs:** Stored for long-term memory and contextual retrieval
- **Bot Actions:** Logged to ensure transparency and reusability.

---

AutoRep – AI-Powered Facebook Sales Assistant

AutoRep is an AI-driven customer engagement tool designed to help small and medium-sized businesses instantly respond to customer inquiries on Facebook posts, ads, and page comments — converting lost leads into paying customers.

🌍 The Problem

Small business owners lose sales every day because they don’t respond fast enough.

Customers comment “How much?” or “Is this available?”

Hours later, the business replies — but the lead is gone.

In a world where speed = sales, delayed replies kill conversions.

🚀 The Solution – AutoRep

AutoRep ensures businesses never miss a sales opportunity by automatically replying to customer comments and messages in real time.

✨ Core Features

Facebook Page Integration

Securely connect one or multiple Facebook Pages.

AutoRep continuously monitors posts, ads, and comments.

Business Resources Upload

Owners upload catalogs, FAQs, price lists, and promotional materials in PDF, text, or CSV format.

AutoRep automatically chunks and embeds this data into TiDB with vector search, making it instantly searchable.

AI-Powered Replies

When a customer comments, AutoRep finds the most relevant info from the business resources.

Gemini AI crafts a friendly, brand-aware response (public comment or private DM).

Configurable Reply Modes

Business owners choose public reply or private message as the default.

Option to switch between manual + automated replies.

Post Tracking & Insights

Dashboard shows all posts, comments, and AutoRep replies.

Analytics on engagement, response time, and conversion potential.

⚙️ How It Works (Workflow)

Connect Facebook Page → Business authorizes AutoRep.

Upload Resources → Product info, FAQs, discounts stored in TiDB.

Monitor Comments → AutoRep detects new comments in real time.

AI Reply → Vector search finds relevant info → Gemini AI generates response.

Customer Engagement → Reply is posted as a comment or DM, instantly.

🔑 Why AutoRep Wins

Real-Time Engagement → No more lost leads.

Smart Replies → Context-aware, accurate, and persuasive.

Built on TiDB → Unified SQL + vector database means scalability, performance, and simplicity.

Empowers Small Businesses → Levels the playing field with big brands by giving them always-on AI customer service.

📊 Example in Action

Customer comments: “How much is the cream?”

AutoRep searches the resource database.

Instantly replies:
“Our Hydrate & Renew Cream is ₦12,000. It helps reduce stretch marks and fine lines ✨. Would you like us to reserve one for you?”

Instead of silence → a lead turns into a sale.

🌟 Future Potential

Multi-platform support (Instagram, WhatsApp, TikTok).

Personalized upselling & cross-selling recommendations.

Multilingual auto-replies for global reach.

🔥 AutoRep doesn’t just reply. It converts.
With TiDB + AI, we’re helping small businesses win customers at scale.
