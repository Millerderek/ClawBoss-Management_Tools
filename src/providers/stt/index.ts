import { Buffer } from "node:buffer";

export interface SttOptions {
  sampleRate: number;
  languageCode: string;
  signal?: AbortSignal;
}

export interface SttProvider {
  transcribe(audio: Buffer, options: SttOptions): Promise<string>;
}
