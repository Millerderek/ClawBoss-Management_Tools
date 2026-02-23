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
