// services/chatService.js
import { chatModel, safetySettings } from "../config/gemini.js";

/**
 * Generate a short, helpful sales reply.
 * @param {object} params
 * @param {string} params.businessName - The name of the business (for brand tone)
 * @param {string} params.customerText - The raw customer comment
 * @param {Array<{content:string, score:number}>} params.contextSnippets - Top retrieved context
 * @returns {Promise<string>} - AI-generated reply text
 */
export async function generateReply({ businessName, customerText, contextSnippets }) {
  // Build context string
  const context = (contextSnippets || [])
    .map((s, i) => `#${i + 1} (score ${s.score?.toFixed(3) || "?"}): ${s.content}`)
    .join("\n");

  const prompt = `
You are an on-brand sales assistant for "${businessName}".
- No emojis unless context shows the brand uses them.

Customer said:
"${customerText}"

Relevant context (ranked):
${context || "No additional business resources available."}
  `.trim();

  try {
    const resp = await chatModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      safetySettings,
    });

    const text = resp?.response?.text()?.trim();
    if (!text) {
      console.warn("⚠️ Gemini returned empty response, falling back.");
      return "Thanks for your interest! Could you please share more details so we can assist you better?";
    }

    return text;
  } catch (err) {
    console.error("❌ generateReply error:", err.message);
    // Fallback to generic safe reply
    return "Thank you for reaching out! A team member will get back to you shortly.";
  }
}
