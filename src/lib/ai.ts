import { getMessages, getRoom, insertMessage } from "./db";
import { publish } from "./events";
import { xaiChat } from "./xai";

let inFlight = false;
let pendingRefire = false;

export function maybeTriggerAI(): void {
  const room = getRoom();
  if (!room || !room.ai_name || !room.persona) return;
  if (room.ai_muted) return;

  if (inFlight) {
    pendingRefire = true;
    return;
  }
  inFlight = true;
  void runAI()
    .catch((err) => {
      console.error("AI error:", err);
      const room = getRoom();
      const aiName = room?.ai_name || "AI";
      const msg = insertMessage(
        "ic",
        aiName,
        "ai",
        `[error generating response: ${err instanceof Error ? err.message : String(err)}]`,
      );
      publish("message", msg);
    })
    .finally(() => {
      inFlight = false;
      if (pendingRefire) {
        pendingRefire = false;
        const room = getRoom();
        if (room && !room.ai_muted) maybeTriggerAI();
      }
    });
}

async function runAI(): Promise<void> {
  const room = getRoom();
  if (!room || !room.ai_name || !room.persona) return;
  const aiName = room.ai_name;

  const history = getMessages("ic", 0, 200);
  if (history.length === 0) return;
  const last = history[history.length - 1];
  if (last.sender_kind === "ai") return;

  publish("room", { typing: true });

  const system = `You are ${aiName}. ${room.persona}

You are participating in an in-character chat with two human users. Respond as ${aiName} only — do not narrate the humans' actions or speak for them. Keep responses natural and conversational in length unless the scene calls for more. Do not prefix your response with your name; the system already attributes it.`;

  const chat: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: system },
  ];

  for (const m of history) {
    if (m.sender_kind === "ai") {
      chat.push({ role: "assistant", content: m.content });
    } else {
      chat.push({ role: "user", content: `${m.sender}: ${m.content}` });
    }
  }

  let response: string;
  try {
    response = await xaiChat(chat);
  } finally {
    publish("room", { typing: false });
  }

  const msg = insertMessage("ic", aiName, "ai", response);
  publish("message", msg);
}
