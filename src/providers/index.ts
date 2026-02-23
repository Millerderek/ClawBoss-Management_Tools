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
    if (process.env.OPENCLAW_API_KEY ?? process.env.OPENAI_API_KEY) {
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
