// routes/auth.js
import express from "express";
import fetch from "node-fetch";
import pool from "../config/db.js"; 

const router = express.Router();

/**
 * Facebook OAuth callback
 * Exchanges ?code → long-lived user token
 * Fetches FB profile → stores/updates user
 */
router.get("/facebook/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: "Missing code" });
    }

    // 1) Exchange code for short-lived token
    const redirectUri = process.env.FB_REDIRECT_URI;
    const tokenResp = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${process.env.FB_APP_ID}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&client_secret=${process.env.FB_APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) {
      return res.status(400).json({ error: "Failed to get user token", details: tokenData });
    }

    // 2) Exchange short-lived → long-lived token
    const longTokenResp = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FB_APP_ID}&client_secret=${process.env.FB_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    );
    const longTokenData = await longTokenResp.json();
    if (!longTokenData.access_token) {
      return res.status(400).json({ error: "Failed to extend token", details: longTokenData });
    }
    const longLivedToken = longTokenData.access_token;

    // 3) Fetch FB user profile
    const profileResp = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name,email&access_token=${longLivedToken}`
    );
    const profileData = await profileResp.json();
    if (!profileData.id) {
      return res.status(400).json({ error: "Failed to fetch user profile", details: profileData });
    }

    const fbUserId = profileData.id;
    const name = profileData.name || null;
    const email = profileData.email || null;

    // 4) Upsert user in DB
    const [rows] = await pool.execute(`SELECT id FROM users WHERE fb_user_id = ? LIMIT 1`, [fbUserId]);

    let userId;
    if (rows.length === 0) {
      const [ins] = await pool.execute(
        `INSERT INTO users (fb_user_id, name, email, access_token) VALUES (?, ?, ?, ?)`,
        [fbUserId, name, email, longLivedToken]
      );
      userId = ins.insertId;
    } else {
      userId = rows[0].id;
      await pool.execute(
        `UPDATE users SET name=?, email=?, access_token=? WHERE id=?`,
        [name, email, longLivedToken, userId]
      );
    }

    // ✅ Redirect back to frontend with login success
    return res.redirect(
      `${process.env.FRONTEND_URL}/dashboard?success=facebook_connected&userId=${userId}&fbUserId=${fbUserId}&name=${encodeURIComponent(
        name || ""
      )}&email=${encodeURIComponent(email || "")}&token=${longLivedToken}`
    );
  } catch (err) {
    console.error("FB Auth Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
