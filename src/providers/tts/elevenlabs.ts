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
