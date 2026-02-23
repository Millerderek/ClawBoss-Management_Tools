#!/bin/bash
set -e

echo "=== Installing livekit-client ==="
cd /root/clawd/voice-gateway
npm install livekit-client

echo "=== Fixing Deepgram STT buffer type ==="
cat > /root/clawd/voice-gateway/src/providers/stt/deepgram.ts << 'EOF'
import { SttProvider, SttOptions } from "./index";

export class DeepgramStt implements SttProvider {
  async transcribe(audio: Buffer, options: SttOptions): Promise<string> {
    const params = new URLSearchParams({
      model: "nova-2",
      language: options.languageCode ?? "en-US",
      sample_rate: String(options.sampleRate),
      encoding: "linear16",
      diarize: "true",
    });

    const response = await fetch(
      `https://api.deepgram.com/v1/listen?${params}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": "audio/raw",
        },
        body: new Uint8Array(audio),
        signal: options.signal,
      }
    );

    if (!response.ok) throw new Error(`Deepgram STT error: ${response.status}`);

    const data = await response.json() as any;
    return data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  }
}
EOF

echo "=== Creating ElevenLabs TTS provider ==="
cat > /root/clawd/voice-gateway/src/providers/tts/elevenlabs.ts << 'EOF'
import { TtsProvider, TtsOptions } from "./index";

const DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

export class ElevenLabsTts implements TtsProvider {
  async synthesize(text: string, options?: TtsOptions): Promise<Buffer> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "",
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          output_format: "pcm_16000",
        }),
        signal: options?.signal,
      }
    );

    if (!response.ok) throw new Error(`ElevenLabs TTS error: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
}
EOF

echo "=== Updating ProviderFactory ==="
cat > /root/clawd/voice-gateway/src/providers/index.ts << 'EOF'
import { config } from "../config";
import { LlmProvider } from "./llm/index";
import { MockLlm } from "./llm/mock";
import { OpenAiLlm } from "./llm/openai";
import { SttProvider } from "./stt/index";
import { DeepgramStt } from "./stt/deepgram";
import { GoogleStt } from "./stt/google";
import { MockStt } from "./stt/mock";
import { TtsProvider } from "./tts/index";
import { ElevenLabsTts } from "./tts/elevenlabs";
import { GoogleTts } from "./tts/google";
import { MockTts } from "./tts/mock";

export interface ProviderSet {
  stt: SttProvider;
  llm: LlmProvider;
  tts: TtsProvider;
}

export class ProviderFactory {
  create(): ProviderSet {
    return {
      stt: this.createStt(),
      llm: this.createLlm(),
      tts: this.createTts(),
    };
  }

  private createStt(): SttProvider {
    if (config.stt.provider === "deepgram" && process.env.DEEPGRAM_API_KEY) {
      console.log("STT: Deepgram");
      return new DeepgramStt();
    }
    if (config.stt.provider === "google" && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log("STT: Google");
      return new GoogleStt();
    }
    console.log("STT: Mock");
    return new MockStt();
  }

  private createLlm(): LlmProvider {
    if (process.env.OPENAI_API_KEY) {
      try {
        console.log("LLM: OpenAI-compatible");
        return new OpenAiLlm();
      } catch (error) {
        console.warn("LLM fallback to mock:", error);
      }
    }
    console.log("LLM: Mock");
    return new MockLlm();
  }

  private createTts(): TtsProvider {
    if (config.tts.provider === "elevenlabs" && process.env.ELEVENLABS_API_KEY) {
      console.log("TTS: ElevenLabs");
      return new ElevenLabsTts();
    }
    if (config.tts.provider === "google" && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log("TTS: Google");
      return new GoogleTts();
    }
    console.log("TTS: Mock");
    return new MockTts();
  }
}
EOF

echo "=== Fixing LiveKitSession ==="
cat > /root/clawd/voice-gateway/src/session/LiveKitSession.ts << 'EOF'
import { randomUUID } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import { Room, RoomEvent, Track, RemoteTrack, RemoteTrackPublication, RemoteParticipant } from "livekit-client";
import { ProviderSet } from "../providers";
import { config } from "../config";

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? "wss://livekit.lutherbot.com";
const API_KEY = process.env.LIVEKIT_API_KEY ?? "";
const API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";
const SESSION_MODE = process.env.SPRING_SESSION_MODE ?? "conversational";

export class LiveKitSession {
  private readonly sessionId = randomUUID();
  private alive = true;
  private audioBuffer: Buffer[] = [];
  private rollingSummary = "";
  private chunkCount = 0;

  constructor(
    private readonly room: string,
    private readonly identity: string,
    private readonly providers: ProviderSet
  ) {}

  async start() {
    console.log(`[LiveKitSession] Starting session ${this.sessionId} room=${this.room} mode=${SESSION_MODE}`);

    const at = new AccessToken(API_KEY, API_SECRET, {
      identity: this.identity,
      ttl: 7200,
    });
    at.addGrant({ roomJoin: true, room: this.room, canPublish: false, canSubscribe: true });
    const token = await at.toJwt();

    const room = new Room();

    room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind !== Track.Kind.Audio) return;
        console.log(`[LiveKitSession] Audio track subscribed from ${participant.identity}`);
        const stream = new MediaStream([track.mediaStreamTrack]);
        void this.processAudioStream(stream);
      }
    );

    room.on(RoomEvent.Disconnected, () => {
      console.log(`[LiveKitSession] Disconnected from room ${this.room}`);
      this.alive = false;
    });

    await room.connect(LIVEKIT_URL, token);
    console.log(`[LiveKitSession] Connected to room ${this.room}`);
  }

  private async processAudioStream(stream: MediaStream) {
    const AudioContext = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
    if (!AudioContext) {
      console.warn("[LiveKitSession] AudioContext not available in Node — using raw track data");
      return;
    }

    const audioContext = new AudioContext({ sampleRate: config.audio.sampleRate });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = async (event: AudioProcessingEvent) => {
      if (!this.alive) return;
      const inputData = event.inputBuffer.getChannelData(0);
      const pcm = Buffer.alloc(inputData.length * 2);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm.writeInt16LE(Math.round(s * 32767), i * 2);
      }
      this.audioBuffer.push(pcm);
      this.chunkCount++;
      if (this.chunkCount % 5 === 0) {
        await this.processChunks();
      }
    };
  }

  private async processChunks() {
    if (this.audioBuffer.length === 0) return;
    const audio = Buffer.concat(this.audioBuffer);
    this.audioBuffer = [];

    try {
      const transcript = await this.providers.stt.transcribe(audio, {
        sampleRate: config.audio.sampleRate,
        languageCode: "en-US",
      });

      if (!transcript.trim()) return;
      console.log(`[LiveKitSession][${SESSION_MODE}] Transcript: ${transcript}`);

      if (SESSION_MODE === "clawboss") {
        await this.updateRollingSummary(transcript);
      } else if (SESSION_MODE === "voicenote") {
        await this.processVoiceNote(transcript);
      } else {
        await this.processConversational(transcript);
      }
    } catch (err: any) {
      console.error(`[LiveKitSession] STT error: ${err?.message}`);
    }
  }

  private async updateRollingSummary(transcript: string) {
    const combined = `${this.rollingSummary}\n[SPEAKER]: ${transcript}`;
    this.rollingSummary = combined.length > 32000 ? combined.slice(-32000) : combined;
    console.log(`[LiveKitSession][clawboss] Summary length=${this.rollingSummary.length}`);
  }

  private async processVoiceNote(transcript: string) {
    const summary = await this.providers.llm.generate(
      `You are ClawBoss. Extract key points and action items from this voice note:\n\n${transcript}`
    );
    console.log(`[LiveKitSession][voicenote] Summary: ${summary}`);
  }

  private async processConversational(transcript: string) {
    const response = await this.providers.llm.generate(transcript);
    console.log(`[LiveKitSession][conversational] Agent: ${response}`);
  }

  getRollingSummary(): string {
    return this.rollingSummary;
  }

  stop() {
    this.alive = false;
    console.log(`[LiveKitSession] Session ${this.sessionId} stopped`);
  }
}
EOF

echo "=== Updating server.ts to add LiveKit agent endpoint ==="
# Remove any previous append first
grep -v "LiveKit agent endpoint\|livekit/join\|LiveKitSession" /root/clawd/voice-gateway/src/server.ts > /tmp/server.ts.tmp
mv /tmp/server.ts.tmp /root/clawd/voice-gateway/src/server.ts

cat >> /root/clawd/voice-gateway/src/server.ts << 'EOF'

// LiveKit agent endpoint
app.post("/livekit/join", async (req, res) => {
  const { room = "clawboss", identity = "agent" } = req.body ?? {};
  try {
    const { LiveKitSession } = await import("./session/LiveKitSession");
    const session = new LiveKitSession(room, identity, providerFactory.create());
    await session.start();
    res.json({ status: "joined", room, identity });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});
EOF

echo "=== Building ==="
cd /root/clawd/voice-gateway
npm run build 2>&1

echo "=== Rebuilding agent container ==="
docker compose up -d --build agent

echo "=== Done ==="
