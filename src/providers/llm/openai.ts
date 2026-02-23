import OpenAI from "openai";
import { config } from "../../config";
import { LlmOptions, LlmProvider } from "./index";

const apiKey = process.env.OPENCLAW_API_KEY ?? process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENCLAW_ENDPOINT
  ? process.env.OPENCLAW_ENDPOINT.replace("/chat/completions", "")
  : undefined;

if (!apiKey) {
  console.warn("OPENAI_API_KEY not set — falling back to mock LLM provider if requested.");
}

export class OpenAiLlm implements LlmProvider {
  private client = new OpenAI({ apiKey: apiKey ?? "none", baseURL });

  async generate(prompt: string, options?: LlmOptions): Promise<string> {
    if (!apiKey) {
      throw new Error("OPENCLAW_API_KEY or OPENAI_API_KEY is required.");
    }
    const response = await this.client.chat.completions.create(
      {
        model: config.llm.model,
        temperature: config.llm.temperature,
        max_tokens: config.llm.maxTokens,
        messages: [
          { role: "system", content: config.llm.systemPrompt },
          { role: "user", content: prompt },
        ],
      },
      { signal: options?.signal }
    );
    return response.choices?.[0]?.message?.content?.trim() ?? "";
  }
}
