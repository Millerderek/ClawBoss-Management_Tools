export interface TtsOptions {
  signal?: AbortSignal;
  sampleRate?: number;
}

export interface TtsProvider {
  synthesize(text: string, options?: TtsOptions): Promise<Buffer>;
}
