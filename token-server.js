const express = require("express");
const path = require("path");
const { AccessToken, AgentDispatchClient } = require("livekit-server-sdk");
const app = express();
const port = process.env.TOKEN_SERVER_PORT || 8090;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const livekitUrl = process.env.LIVEKIT_URL || "ws://livekit-server:7880";
const ttl = parseInt(process.env.LIVEKIT_TOKEN_TTL || "600");

// Track active dispatches to prevent duplicates
const activeRooms = new Set();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/token", async (req, res) => {
  const room = req.query.room || "clawboss";
  const identity = req.query.identity || "manager";
  const mode = req.query.mode || "braindump";
  if (!apiKey || !apiSecret) {
    return res.status(500).json({ error: "LIVEKIT_API_KEY or LIVEKIT_API_SECRET not set" });
  }
  try {
    const at = new AccessToken(apiKey, apiSecret, { identity, ttl, metadata: JSON.stringify({ mode }) });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();

    // Only dispatch once per room
    if (!activeRooms.has(room)) {
      activeRooms.add(room);
      setTimeout(() => activeRooms.delete(room), 30000); // reset after 30s
      try {
        const dispatchClient = new AgentDispatchClient(livekitUrl, apiKey, apiSecret);
        await dispatchClient.createDispatch(room, "", { metadata: JSON.stringify({ mode }) });
        console.log(`Agent dispatched to room ${room} mode=${mode}`);
      } catch (dispatchErr) {
        console.warn("Agent dispatch failed:", dispatchErr.message);
        activeRooms.delete(room);
      }
    } else {
      console.log(`Agent already dispatched to room ${room}, skipping`);
    }

    res.json({ token, room, identity, mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.listen(port, "0.0.0.0", () => {
  console.log(`Token server listening on port ${port}`);
});
