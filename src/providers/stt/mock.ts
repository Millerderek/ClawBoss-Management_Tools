import { SttProvider, SttOptions } from "./index";

export class MockStt implements SttProvider {
  async transcribe(_: Buffer, options: SttOptions): Promise<string> {
    const timestamp = new Date().toISOString();
    return `Mock transcript [${timestamp}] (${options.sampleRate} Hz, ${options.languageCode})`;
  }
}
