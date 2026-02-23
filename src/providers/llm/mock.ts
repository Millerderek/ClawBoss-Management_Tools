import { LlmOptions, LlmProvider } from "./index";

export class MockLlm implements LlmProvider {
  async generate(prompt: string): Promise<string> {
    const summary = prompt.trim().slice(0, 150);
    return `Mock answer: I understood "${summary}". How can I help you further?`;
  }
}
