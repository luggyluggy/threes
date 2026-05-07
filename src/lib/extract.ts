import {
  getAllUserPersonas,
  getMessages,
  getPositions,
  getRoom,
  setPosition,
} from "./db";
import { ROOMS, ROOM_IDS } from "./rooms";
import { xaiJson } from "./xai";

interface ExtractionResult {
  movements?: Array<{ character?: unknown; room?: unknown }>;
}

const CONTEXT_WINDOW = 8;

/**
 * Read the last few IC messages and ask Grok to extract any character location
 * changes implied by the latest message. Updates the character_positions table
 * directly. Idempotent — safe to call repeatedly.
 */
export async function extractAndApplyMovements(): Promise<void> {
  const room = await getRoom();
  if (!room || !room.ai_name) return;

  const history = await getMessages("ic", 0, CONTEXT_WINDOW);
  if (history.length === 0) return;

  const personas = await getAllUserPersonas();
  const positions = await getPositions();

  const knownCharacters = new Set<string>();
  for (const p of personas) knownCharacters.add(p.name);
  for (const m of history) if (m.sender_kind === "human") knownCharacters.add(m.sender);
  knownCharacters.add(room.ai_name);

  const positionsByChar = new Map(positions.map((p) => [p.character_name, p.room_id]));

  const roomList = ROOMS.map((r) => `- ${r.id} (${r.label}: ${r.description})`).join("\n");
  const charList = Array.from(knownCharacters)
    .sort()
    .map((c) => {
      const pos = positionsByChar.get(c);
      const role = c === room.ai_name ? " (AI)" : " (human)";
      return `- ${c}${role}: ${pos ? `currently in ${pos}` : "location unknown"}`;
    })
    .join("\n");

  const transcript = history
    .map((m) => `${m.sender_kind === "ai" ? `[AI] ${m.sender}` : m.sender}: ${m.content}`)
    .join("\n");

  const latest = history[history.length - 1];

  const system = `You extract character location updates from a prison roleplay chat transcript. You output ONLY JSON.

Rooms (use these EXACT ids):
${roomList}

Known characters:
${charList}

Output schema:
{ "movements": [ { "character": "<exact-name>", "room": "<exact-room-id>" } ] }

Rules:
- Output movements ONLY if the LATEST message clearly establishes a new location for one or more characters (e.g. "I walk to the dining hall", "guards drag him to interrogation").
- Use ONLY characters from the known list and rooms from the list above. Skip anything else.
- If a movement is ambiguous, vague, or already matches the current location, DO NOT include it.
- Output an empty array if no movements are implied: { "movements": [] }.
- Output JSON ONLY. No prose.`;

  const user = `Recent transcript (oldest first):
${transcript}

Latest message (extract movements implied here):
${latest.sender}: ${latest.content}

Return JSON now.`;

  let result: ExtractionResult;
  try {
    result = await xaiJson<ExtractionResult>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { model: process.env.XAI_EXTRACT_MODEL || process.env.XAI_MODEL },
    );
  } catch (err) {
    console.error("extraction failed:", err);
    return;
  }

  const moves = Array.isArray(result.movements) ? result.movements : [];
  for (const m of moves) {
    if (typeof m.character !== "string" || typeof m.room !== "string") continue;
    if (!knownCharacters.has(m.character)) continue;
    if (!ROOM_IDS.has(m.room)) continue;
    if (positionsByChar.get(m.character) === m.room) continue;
    await setPosition(m.character, m.room);
  }
}
