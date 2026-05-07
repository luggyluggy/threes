interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function xaiChat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is not set");
  const baseUrl = process.env.XAI_BASE_URL || "https://api.x.ai/v1";
  const model = process.env.XAI_MODEL || "grok-4";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.9 }),
    signal,
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
