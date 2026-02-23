import { randomUUID } from "node:crypto";
import WebSocket, { RawData } from "ws";
import { config } from "../config";
import { ProviderSet } from "../providers";
import { MetricsLogger } from "../metrics/logger";
import { SessionState, SessionStateMachine } from "../core/stateMachine";
import { decodeMuLaw, encodeMuLaw } from "../audio/mulaw";
import { computeRms } from "../audio/vad";
import { resampleBuffer } from "../audio/resample";
import { sleep } from "../utils/delay";

interface TwilioStartMessage {
  event: "start";
  start: {
    callSid: string;
    streamSid: string;
  };
}

interface TwilioStopMessage {
  event: "stop";
  stop: {
    reason?: string;
  };
}

interface TwilioMediaMessage {
  event: "media";
  media: {
    payload: string;
    track: string;
  };
  streamSid: string;
}

type TwilioMessage = TwilioStartMessage | TwilioStopMessage | TwilioMediaMessage;

export class TwilioSession {
  private readonly sessionId = randomUUID();
  private readonly metrics = new MetricsLogger(this.sessionId);
  private readonly stateMachine = new SessionStateMachine(this.metrics);
  private readonly frameBytes = config.audio.frameBytes;
  private processing: Promise<void> = Promise.resolve();
  private callSid?: string;
  private streamSid?: string;
  private collected: Buffer[] = [];
  private speaking = false;
  private silenceFrames = 0;
  private alive = true;
  private sttController?: AbortController;
  private llmController?: AbortController;
  private ttsController?: AbortController;

  constructor(private ws: WebSocket, private providers: ProviderSet) {
    this.metrics.info("session-start", { streamPath: config.twilio.streamPath });
    ws.on("message", (value) => this.handleRaw(value));
    ws.on("close", () => this.close());
    ws.on("error", (error) => this.metrics.error("websocket-error", { message: error?.message }));
  }

  private handleRaw(value: RawData) {
    if (!this.alive) return;
    const buffer = this.bufferFromRaw(value);
    const text = buffer.toString();
    let message: TwilioMessage | undefined;
    try {
      message = JSON.parse(text) as TwilioMessage;
    } catch (error) {
      this.metrics.warn("malformed-event", { text: text.slice(0, 200) });
      return;
    }

    switch (message.event) {
      case "start":
        this.handleStart(message);
        break;
      case "media":
        this.handleMedia(message);
        break;
      case "stop":
        this.metrics.info("twilio-stop", { reason: message.stop.reason });
        this.close();
        break;
      default:
        this.metrics.warn("unknown-event", { event: (message as any).event });
    }
  }

  private handleStart(message: TwilioStartMessage) {
    this.callSid = message.start.callSid;
    this.streamSid = message.start.streamSid;
    this.metrics.info("twilio-start", { callSid: this.callSid });
  }

  private handleMedia(message: TwilioMediaMessage) {
    if (!message.media.payload) return;
    const decoded = decodeMuLaw(Buffer.from(message.media.payload, "base64"));
    const energy = computeRms(decoded);
    if (this.stateMachine.state === SessionState.SPEAKING && energy >= config.audio.bargeInThreshold) {
      this.triggerBargeIn();
      return;
    }

    if (energy >= config.audio.vadThreshold) {
      this.collected.push(decoded);
      this.silenceFrames = 0;
      if (!this.speaking) {
        this.speaking = true;
        this.stateMachine.transition(SessionState.LISTENING);
      }
    } else if (this.speaking) {
      this.collected.push(decoded);
      this.silenceFrames += 1;
      if (this.silenceFrames >= config.audio.silenceFrames) {
        this.speaking = false;
        this.emitUtterance();
      }
    }
  }

  private emitUtterance() {
    const payload = Buffer.concat(this.collected);
    this.collected = [];
    if (!payload.length) {
      return;
    }
    this.processing = this.processing
      .then(() => this.processTurn(payload))
      .catch((error) => {
        this.metrics.error("utterance-failure", { error: (error as Error)?.message });
      });
  }

  private async processTurn(audio: Buffer) {
    if (!this.alive) return;
    this.stateMachine.transition(SessionState.TRANSCRIBING);
    this.sttController = new AbortController();
    try {
      const sttBuffer = resampleBuffer(audio, config.audio.sampleRate, config.stt.sampleRate);
      const transcript = await this.providers.stt.transcribe(sttBuffer, {
        sampleRate: config.stt.sampleRate,
        languageCode: config.stt.languageCode,
        signal: this.sttController.signal,
      });

      if (!transcript.trim()) {
        this.metrics.warn("empty-transcript");
        return;
      }

      this.stateMachine.transition(SessionState.THINKING);
      this.llmController = new AbortController();
      const response = await this.providers.llm.generate(transcript, {
        signal: this.llmController.signal,
      });

      if (!response.trim()) {
        this.metrics.warn("empty-response", { transcript });
        return;
      }

      this.metrics.event("llm-response", { length: response.length });
      this.stateMachine.transition(SessionState.SPEAKING);
      this.ttsController = new AbortController();
      const ttsBuffer = await this.providers.tts.synthesize(response, {
        signal: this.ttsController.signal,
        sampleRate: config.tts.sampleRate,
      });

      await this.playAudio(ttsBuffer);
    } finally {
      this.clearControllers();
      this.stateMachine.transition(SessionState.LISTENING);
    }
  }

  private async playAudio(buffer: Buffer) {
    if (!buffer.length) return;
    const normalized = resampleBuffer(buffer, config.tts.sampleRate, config.audio.sampleRate);
    const totalFrames = Math.ceil(normalized.length / this.frameBytes);
    const padded = Buffer.alloc(totalFrames * this.frameBytes);
    normalized.copy(padded);

    for (let offset = 0; offset < padded.length; offset += this.frameBytes) {
      if (!this.alive) break;
      if (this.ttsController?.signal.aborted) break;
      const slice = padded.slice(offset, offset + this.frameBytes);
      const muLaw = encodeMuLaw(slice);
      this.sendMedia(muLaw);
      await sleep(config.audio.frameMs);
    }
  }

  private sendMedia(payload: Buffer) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const message = {
      event: "media",
      streamSid: this.streamSid,
      media: {
        payload: payload.toString("base64"),
      },
    } as const;
    this.ws.send(JSON.stringify(message));
  }

  private triggerBargeIn() {
    if (this.stateMachine.state !== SessionState.SPEAKING) {
      return;
    }
    this.metrics.event("barge-in");
    this.sttController?.abort();
    this.llmController?.abort();
    this.ttsController?.abort();
    this.stateMachine.transition(SessionState.LISTENING);
  }

  private clearControllers() {
    this.sttController = undefined;
    this.llmController = undefined;
    this.ttsController = undefined;
  }

  private bufferFromRaw(value: RawData): Buffer {
    if (typeof value === "string") {
      return Buffer.from(value);
    }
    if (Buffer.isBuffer(value)) {
      return value;
    }
    if (Array.isArray(value)) {
      return Buffer.concat(value);
    }
    if (ArrayBuffer.isView(value)) {
      return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    }
    return Buffer.from(value);
  }

  private close() {
    if (!this.alive) return;
    this.alive = false;
    this.metrics.info("session-end", { callSid: this.callSid });
    void this.ws.close();
  }
}
