interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface XaiOptions {
  model?: string;
  temperature?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
}

async function xaiCall(messages: ChatMessage[], opts: XaiOptions = {}): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is not set");
  const baseUrl = process.env.XAI_BASE_URL || "https://api.x.ai/v1";
  const model = opts.model || process.env.XAI_MODEL || "grok-4";

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.9,
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`xAI ${res.status}: ${text || res.statusText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("xAI returned empty response");
  return content;
}

export async function xaiChat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  return xaiCall(messages, { signal });
}

export async function xaiJson<T>(messages: ChatMessage[], opts: XaiOptions = {}): Promise<T> {
  const raw = await xaiCall(messages, { ...opts, jsonMode: true, temperature: opts.temperature ?? 0.2 });
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Some models wrap JSON in code fences despite json_object mode; strip and retry.
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(stripped) as T;
  }
}
