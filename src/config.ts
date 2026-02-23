import dotenv from "dotenv";

dotenv.config();

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeProvider = (value: string | undefined, fallback: string) => {
  return value?.trim().toLowerCase() || fallback;
};

const audioSampleRate = parseNumber(process.env.AUDIO_SAMPLE_RATE, 8000);
const audioFrameMs = parseNumber(process.env.AUDIO_FRAME_MS, 20);
const frameSamples = Math.round((audioSampleRate * audioFrameMs) / 1000);
const frameBytes = frameSamples * 2;

export const config = {
  server: {
    host: process.env.HOST ?? "0.0.0.0",
    port: parseNumber(process.env.PORT, 9000),
  },
  twilio: {
    incomingPath: process.env.TWILIO_INCOMING_PATH ?? "/twilio/incoming",
    streamPath: process.env.TWILIO_STREAM_PATH ?? "/twilio/stream",
    streamUrl:
      process.env.TWILIO_STREAM_URL ??
      `wss://localhost:${process.env.PORT ?? 9000}${process.env.TWILIO_STREAM_PATH ?? "/twilio/stream"}`,
    streamToken: process.env.TWILIO_STREAM_TOKEN ?? "luther-secret",
    streamName: process.env.TWILIO_STREAM_NAME ?? "luther-session",
    greeting: process.env.TWILIO_GREETING ?? "Hold tight—connecting you to Luther.",
  },
  audio: {
    sampleRate: audioSampleRate,
    frameMs: audioFrameMs,
    frameBytes,
    vadThreshold: parseNumber(process.env.VAD_THRESHOLD, 200),
    silenceFrames: parseNumber(process.env.SILENCE_FRAMES, 8),
    bargeInThreshold: parseNumber(process.env.BARGE_IN_THRESHOLD, 220),
  },
  llm: {
    provider: normalizeProvider(process.env.LLM_PROVIDER, "openai"),
    model: process.env.LLM_MODEL ?? "gpt-4o-mini",
    temperature: parseNumber(process.env.LLM_TEMPERATURE, 0.3),
    systemPrompt:
      process.env.LLM_SYSTEM_PROMPT ??
      "You are Luther, a confident but kind assistant helping a caller over the phone. Keep responses concise but conversational.",
    maxTokens: parseNumber(process.env.LLM_MAX_TOKENS, 512),
  },
  stt: {
    provider: normalizeProvider(process.env.STT_PROVIDER, "mock"),
    languageCode: process.env.STT_LANGUAGE ?? "en-US",
    sampleRate: parseNumber(process.env.STT_SAMPLE_RATE, 16000),
  },
  tts: {
    provider: normalizeProvider(process.env.TTS_PROVIDER, "mock"),
    voice: process.env.GOOGLE_TTS_VOICE ?? "en-US-Wavenet-F",
    sampleRate: parseNumber(process.env.TTS_SAMPLE_RATE, 16000),
  },
};

export type Config = typeof config;
