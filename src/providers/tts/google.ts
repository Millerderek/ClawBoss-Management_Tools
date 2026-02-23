import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { config } from "../../config";
import { TtsOptions, TtsProvider } from "./index";

export class GoogleTts implements TtsProvider {
  private client = new TextToSpeechClient();

  async synthesize(text: string, options?: TtsOptions): Promise<Buffer> {
    const [response] = await this.client.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode: "en-US",
        name: config.tts.voice,
        ssmlGender: "NEUTRAL",
      },
      audioConfig: {
        audioEncoding: "LINEAR16",
        sampleRateHertz: options?.sampleRate ?? config.tts.sampleRate,
      },
    });
    const content = response.audioContent;
    if (!content) {
      return Buffer.alloc(0);
    }
    if (typeof content === "string") {
      return Buffer.from(content, "base64");
    }
    if (content instanceof Buffer) {
      return content;
    }
    if (content instanceof Uint8Array) {
      return Buffer.from(content);
    }
    return Buffer.from(content as ArrayBuffer);
  }
}
