import { z } from "zod";
import { PolicyError } from "./policySchema.js";
import { readPolicyJson } from "./policyHttp.js";

export interface OpenAIHealth {
  mode: "openai" | "fallback";
  model: string;
  baseUrl: string;
  ok: boolean;
  message: string;
}

const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 90000);

export async function getOpenAIHealth(): Promise<OpenAIHealth> {
  const { apiKey, baseUrl, model } = getConfig();
  if (!apiKey) {
    return {
      mode: "fallback",
      model,
      baseUrl,
      ok: false,
      message: "OPENAI_API_KEY is not configured; deterministic demo output will be used."
    };
  }

  try {
    const response = await fetch(`${baseUrl}/models/${model}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`OpenAI returned ${response.status}`);
    return {
      mode: "openai",
      model,
      baseUrl,
      ok: true,
      message: "Configured OpenAI model is available."
    };
  } catch {
    return {
      mode: "fallback",
      model,
      baseUrl,
      ok: false,
      message: "OpenAI is unavailable; deterministic demo output will be used."
    };
  }
}

export async function generateJson<T>(prompt: string): Promise<T | null> {
  const { apiKey, baseUrl, model } = getConfig();
  if (!apiKey) return null;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "developer",
            content: "You produce valid JSON only. Do not include markdown fences or explanatory prose."
          },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { apiKey, baseUrl } = getConfig();
  if (!apiKey) throw new PolicyError("Configure OPENAI_API_KEY to use policy RAG.", 503);
  if (!texts.length || texts.length > 300) throw new PolicyError("Policy retrieval requires between 1 and 300 text chunks.", 422);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small", input: texts }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw new PolicyError("Policy embedding provider timed out or is unavailable.", 503);
  }
  if (!response.ok) throw new PolicyError("Policy embedding provider rejected the request. Check the embedding model and AI configuration.", 503);
  const parsed = z.object({
    data: z.array(z.object({
      index: z.number().int().nonnegative(),
      embedding: z.array(z.number().finite()).min(1).max(4096)
    })).max(300)
  }).safeParse(await readPolicyJson(response, 32 * 1024 * 1024));
  if (!parsed.success || parsed.data.data.length !== texts.length) {
    throw new PolicyError("Policy embedding provider returned invalid vectors.");
  }
  const vectors = parsed.data.data.sort((a, b) => a.index - b.index);
  if (vectors.some((item, index) => item.index !== index || item.embedding.length !== vectors[0].embedding.length
    || item.embedding.every((value) => value === 0))) {
    throw new PolicyError("Policy embedding provider returned inconsistent vectors.");
  }
  return vectors.map((item) => item.embedding);
}

function getConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini"
  };
}
