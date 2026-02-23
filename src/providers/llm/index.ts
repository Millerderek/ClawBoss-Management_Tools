export interface LlmOptions {
  signal?: AbortSignal;
}

export interface LlmProvider {
  generate(prompt: string, options?: LlmOptions): Promise<string>;
}
