// routes/auth.js
import express from "express";
import fetch from "node-fetch";
import pool from "../config/db.js"; // TiDB connection pool

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
      await pool.execute(
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
