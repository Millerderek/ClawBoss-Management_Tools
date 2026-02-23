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
