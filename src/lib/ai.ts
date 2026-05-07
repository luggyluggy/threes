import {
  getAllUserPersonas,
  getMessages,
  getRoom,
  insertMessage,
  setTyping,
  tryAcquireTyping,
} from "./db";
import { xaiChat } from "./xai";

/**
 * Run the AI loop. Acquires a DB-level lock so concurrent invocations don't
 * generate parallel responses. Loops while new human messages arrive during
 * generation, so a fast back-and-forth from the humans still gets handled.
 *
 * Designed to be called from `after()` so it can run past the response.
 */
export async function runAILoop(): Promise<void> {
  const room = await getRoom();
  if (!room || !room.ai_name || !room.persona || room.ai_muted) return;

  const acquired = await tryAcquireTyping();
  if (!acquired) return; // Another invocation is already generating.

  try {
    let safety = 0;
    while (safety++ < 5) {
      const fresh = await getRoom();
      if (!fresh || fresh.ai_muted) break;

      const history = await getMessages("ic", 0, 200);
      if (history.length === 0) break;
      const last = history[history.length - 1];
      if (last.sender_kind === "ai") break;

      const aiName = fresh.ai_name!;
      const personas = await getAllUserPersonas();
      const seenNames = new Set<string>();
      for (const m of history) if (m.sender_kind === "human") seenNames.add(m.sender);
      for (const p of personas) seenNames.add(p.name);
      const personaMap = new Map(personas.map((p) => [p.name, p.persona]));

      const personaLines = Array.from(seenNames)
        .sort()
        .map((n) => {
          const p = personaMap.get(n);
          return p ? `- ${n}: ${p}` : `- ${n}: (no persona set)`;
        })
        .join("\n");

      const system = `You are ${aiName}. ${fresh.persona}

The human users in this chat and the characters they are playing:
${personaLines || "- (no humans have spoken yet)"}

You are participating in an in-character chat. Respond as ${aiName} only — do not narrate the humans' actions or speak for them. Keep responses natural and conversational in length unless the scene calls for more. Do not prefix your response with your name; the system already attributes it.`;

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
      } catch (err) {
        await insertMessage(
          "ic",
          aiName,
          "ai",
          `[error generating response: ${err instanceof Error ? err.message : String(err)}]`,
        );
        break;
      }

      await insertMessage("ic", aiName, "ai", response);
    }
  } finally {
    await setTyping(false);
  }
}
