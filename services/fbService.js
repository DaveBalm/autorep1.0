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
