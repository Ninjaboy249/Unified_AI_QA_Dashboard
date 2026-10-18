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

function getConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini"
  };
}
