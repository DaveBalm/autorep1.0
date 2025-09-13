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
