import { SpeechClient } from "@google-cloud/speech";
import { SttProvider, SttOptions } from "./index";

export class GoogleStt implements SttProvider {
  private client = new SpeechClient();

  async transcribe(audio: Buffer, options: SttOptions): Promise<string> {
    if (options.signal?.aborted) {
      throw new Error("STT request aborted before sending");
    }

    const request = {
      audio: { content: audio.toString("base64") },
      config: {
        encoding: "LINEAR16" as const,
        languageCode: options.languageCode,
        sampleRateHertz: options.sampleRate,
        enableAutomaticPunctuation: true,
      },
    };

    const [response] = await this.client.recognize(request);
    const payload = response.results
      ?.map((result) => result.alternatives?.[0]?.transcript)
      .filter(Boolean)
      .join(" ")
      .trim();

    return payload || "";
  }
}
