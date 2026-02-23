const express = require("express");
const path = require("path");
const fs = require("fs");
const { AccessToken, AgentDispatchClient } = require("livekit-server-sdk");
const app = express();
const port = process.env.TOKEN_SERVER_PORT || 8090;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const livekitUrl = process.env.LIVEKIT_URL || "ws://livekit-server:7880";
const ttl = parseInt(process.env.LIVEKIT_TOKEN_TTL || "600");
const LOCK_TTL = 120000;
const LOCK_FILE = "/tmp/dispatch_locks.json";

function getLocks() {
  try { return JSON.parse(fs.readFileSync(LOCK_FILE, "utf8")); } catch { return {}; }
}
function setLock(room) {
  const locks = getLocks();
  locks[room] = Date.now();
  fs.writeFileSync(LOCK_FILE, JSON.stringify(locks));
}
function clearLock(room) {
  const locks = getLocks();
  delete locks[room];
  fs.writeFileSync(LOCK_FILE, JSON.stringify(locks));
}
function isLocked(room) {
  const locks = getLocks();
  return locks[room] && (Date.now() - locks[room]) < LOCK_TTL;
}

app.use((req, res, next) => { res.header("Access-Control-Allow-Origin", "*"); next(); });
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.get("/token", async (req, res) => {
  const room = req.query.room || "clawboss";
  const identity = req.query.identity || "manager";
  const mode = req.query.mode || "braindump";
  if (!apiKey || !apiSecret) return res.status(500).json({ error: "Missing API keys" });
  try {
    const at = new AccessToken(apiKey, apiSecret, { identity, ttl, metadata: JSON.stringify({ mode }) });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();

    console.log(`[TOKEN] ${room} mode=${mode} (agent auto-dispatches)`);
    }

    res.json({ token, room, identity, mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/dispatch/clear/:room", (req, res) => {
  clearLock(req.params.room);
  res.json({ cleared: req.params.room });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.listen(port, "0.0.0.0", () => console.log(`Token server listening on port ${port}`));
