const express = require("express");
const { AccessToken } = require("livekit-server-sdk");

const app = express();
const port = process.env.TOKEN_SERVER_PORT || 8090;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const ttl = parseInt(process.env.LIVEKIT_TOKEN_TTL || "600");

app.get("/token", async (req, res) => {
  const room = req.query.room || "clawboss";
  const identity = req.query.identity || "manager";

  if (!apiKey || !apiSecret) {
    return res.status(500).json({ error: "LIVEKIT_API_KEY or LIVEKIT_API_SECRET not set" });
  }

  try {
    const at = new AccessToken(apiKey, apiSecret, { identity, ttl });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();
    res.json({ token, room, identity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(port, "0.0.0.0", () => {
  console.log(`Token server listening on port ${port}`);
});
