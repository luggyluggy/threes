import {
  getAllUserPersonas,
  getMessages,
  getPositions,
  getRoom,
  insertMessage,
  insertScheduledTask,
  refreshTyping,
  setTyping,
  tryAcquireTyping,
} from "./db";
import { extractAndApplyMovements } from "./extract";
import { roomLabel } from "./rooms";
import { xaiChatWithTools, type ToolDefinition } from "./xai";

// Hard cap per xAI call, slightly under Vercel's 60s maxDuration so the
// finally always runs and releases the typing lock.
const XAI_CALL_TIMEOUT_MS = 50_000;

const SCHEDULE_TOOL: ToolDefinition = {
  name: "schedule_action",
  description:
    "Schedule yourself to perform an in-character action at a future time. Use for inspections, patrols, check-ins, or anything that should happen hours from now.",
  parameters: {
    type: "object",
    properties: {
      trigger_note: {
        type: "string",
        description:
          "A specific note to yourself describing exactly what to do when this task fires.",
      },
      delay_hours: {
        type: "number",
        description:
          "How many hours from now to perform this action. Can be fractional (e.g. 0.5 for 30 minutes).",
      },
    },
    required: ["trigger_note", "delay_hours"],
  },
};

export async function runAILoop(opts: { triggerNote?: string } = {}): Promise<void> {
  const room = await getRoom();
  if (!room || !room.ai_name || !room.persona || room.ai_muted) return;

  const acquired = await tryAcquireTyping();
  if (!acquired) return;

  let { triggerNote } = opts;

  try {
    let safety = 0;
    while (safety++ < 5) {
      const fresh = await getRoom();
      if (!fresh || fresh.ai_muted) break;

      const history = await getMessages("ic", 0, 200);
      const lastIsAI =
        history.length > 0 && history[history.length - 1].sender_kind === "ai";

      // For triggered runs, generate even if AI had the last word (or history is empty).
      // For reactive runs, stop if AI already has the last word or there's nothing to respond to.
      if (!triggerNote) {
        if (history.length === 0 || lastIsAI) break;
      }

      const aiName = fresh.ai_name!;
      const personas = await getAllUserPersonas();
      const positions = await getPositions();
      const personaMap = new Map(personas.map((p) => [p.name, p.persona]));
      const positionMap = new Map(positions.map((p) => [p.character_name, p.room_id]));

      const seenNames = new Set<string>();
      for (const m of history) if (m.sender_kind === "human") seenNames.add(m.sender);
      for (const p of personas) seenNames.add(p.name);

      const personaLines = Array.from(seenNames)
        .sort()
        .map((n) => {
          const p = personaMap.get(n);
          return p ? `- ${n}: ${p}` : `- ${n}: (no persona set)`;
        })
        .join("\n");

      const allNamesForLocations = new Set<string>(seenNames);
      allNamesForLocations.add(aiName);
      const locationLines = Array.from(allNamesForLocations)
        .sort()
        .map((n) => {
          const r = positionMap.get(n);
          const tag = n === aiName ? " (you)" : "";
          return r ? `- ${n}${tag}: ${roomLabel(r)}` : `- ${n}${tag}: location unknown`;
        })
        .join("\n");

      const triggerClause = triggerNote
        ? `\n\n(Scheduled reminder — carry this out now, do not mention it was scheduled: ${triggerNote})`
        : "";

      const system = `You are ${aiName}. ${fresh.persona}

The human users in this chat and the characters they are playing:
${personaLines || "- (no humans have spoken yet)"}

Current locations in the prison:
${locationLines}

You are participating in an in-character chat. Respond as ${aiName} only — do not narrate the humans' actions or speak for them. Stay consistent with the current locations: don't claim to be somewhere you aren't. If you want to move, narrate it clearly (e.g. "I walk to the dining hall") so the location updates. Keep responses natural and conversational in length unless the scene calls for more. Do not prefix your response with your name; the system already attributes it.

You may use the schedule_action tool to queue future in-character actions (daily inspections, patrols, follow-ups, etc.). When you schedule something, continue your response naturally without announcing that you set a reminder.${triggerClause}`;

      // Clear triggerNote after first iteration so subsequent reactive iterations behave normally.
      triggerNote = undefined;

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

      // Refresh the heartbeat each iteration so a slow but live response
      // doesn't get its lock stolen by clearStaleTyping.
      await refreshTyping().catch((e) => console.error("refreshTyping failed:", e));

      let content: string;
      let toolCalls: Awaited<ReturnType<typeof xaiChatWithTools>>["toolCalls"];
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), XAI_CALL_TIMEOUT_MS);
      try {
        ({ content, toolCalls } = await xaiChatWithTools(
          chat,
          [SCHEDULE_TOOL],
          ac.signal,
        ));
      } catch (err) {
        const isAbort =
          (err instanceof Error && err.name === "AbortError") || ac.signal.aborted;
        const msg = isAbort
          ? `xAI call timed out after ${XAI_CALL_TIMEOUT_MS}ms`
          : err instanceof Error
            ? err.message
            : String(err);
        const is503 = msg.includes("503");
        await insertMessage(
          "ic",
          aiName,
          "ai",
          is503 || isAbort
            ? "The officer is currently away from his post (error). He will be back soon."
            : `[error generating response: ${msg}]`,
        );
        break;
      } finally {
        clearTimeout(timer);
      }

      // Persist any scheduled tasks the AI requested.
      for (const tc of toolCalls) {
        if (tc.name === "schedule_action") {
          const note =
            typeof tc.arguments.trigger_note === "string" ? tc.arguments.trigger_note : "";
          const hours =
            typeof tc.arguments.delay_hours === "number" ? tc.arguments.delay_hours : 1;
          if (note && hours > 0) {
            const scheduledFor = Date.now() + Math.round(hours * 60 * 60 * 1000);
            await insertScheduledTask(note, scheduledFor).catch((e) =>
              console.error("failed to save scheduled task:", e),
            );
          }
        }
      }

      if (content) {
        await insertMessage("ic", aiName, "ai", content);
        try {
          await extractAndApplyMovements();
        } catch (err) {
          console.error("post-AI extraction failed:", err);
        }
      }
    }
  } finally {
    await setTyping(false);
  }
}
