import { TtsOptions, TtsProvider } from "./index";

export class MockTts implements TtsProvider {
  async synthesize(text: string, options?: TtsOptions): Promise<Buffer> {
    const sampleRate = options?.sampleRate ?? 16000;
    const durationSeconds = Math.min(3, 0.5 + text.length * 0.04);
    const samples = Math.max(1, Math.floor(durationSeconds * sampleRate));
    const buffer = Buffer.alloc(samples * 2);
    const frequency = 220 + (text.length % 5) * 40;
    for (let i = 0; i < samples; i += 1) {
      const t = i / sampleRate;
      const amplitude = 0.2 * 0x7fff;
      const value = Math.round(amplitude * Math.sin(2 * Math.PI * frequency * t));
      buffer.writeInt16LE(value, i * 2);
    }
    return buffer;
  }
}
