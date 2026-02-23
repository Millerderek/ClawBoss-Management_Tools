import express from "express";
import http from "node:http";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { buildTwiml } from "./twilio/twiml";
import { ProviderFactory } from "./providers";
import { TwilioSession } from "./session/TwilioSession";
import { LiveKitSession } from "./session/LiveKitSession";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.post(config.twilio.incomingPath, (req, res) => {
  const twiml = buildTwiml({
    streamUrl: config.twilio.streamUrl,
    streamToken: config.twilio.streamToken,
    streamName: config.twilio.streamName,
    greeting: config.twilio.greeting,
  });
  res.type("text/xml").send(twiml);
});

app.get("/", (_, res) => res.send("Luther voice gateway is ready"));

app.post("/livekit/join", async (req, res) => {
  const { room = "clawboss", identity = "agent" } = req.body ?? {};
  try {
    const session = new LiveKitSession(room, identity, providerFactory.create());
    await session.start();
    res.json({ status: "joined", room, identity });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

const server = http.createServer(app);
const providerFactory = new ProviderFactory();

const wss = new WebSocketServer({ server, path: config.twilio.streamPath });

wss.on("connection", (ws, req) => {
  try {
    const origin = req.url ? new URL(req.url, `http://${req.headers.host ?? ""}`) : null;
    const token = origin?.searchParams.get("token");
    if (token !== config.twilio.streamToken) {
      ws.close(1008, "invalid token");
      return;
    }
  } catch (error) {
    ws.close(1008, "bad handshake");
    return;
  }
  new TwilioSession(ws, providerFactory.create());
});

server.listen(config.server.port, config.server.host, () => {
  console.log(`Luther voice gateway listening on ${config.server.host}:${config.server.port}`);
});
