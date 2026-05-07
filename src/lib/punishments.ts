import {
  getPunishments,
  getRecentMessages,
  getRoom,
  insertPunishment,
} from "./db";
import { xaiJson } from "./xai";

const SCAN_WINDOW = 50;

interface ExtractedPunishment {
  source_message_id?: unknown;
  inmate?: unknown;
  punishment?: unknown;
  administrator?: unknown;
}

interface ExtractionResult {
  punishments?: ExtractedPunishment[];
}

/**
 * Scan the last SCAN_WINDOW IC messages for newly-administered punishments
 * and persist any that haven't been logged yet. Idempotent: source_message_id
 * is UNIQUE on the punishments table.
 */
export async function scanForPunishments(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room || !room.ai_name) return;

  const messages = await getRecentMessages(roomId, "ic", SCAN_WINDOW);
  if (messages.length === 0) return;

  const existing = await getPunishments(roomId, 500);
  const alreadyLogged = new Set(existing.map((p) => p.source_message_id));

  const candidates = messages.filter((m) => !alreadyLogged.has(m.id));
  if (candidates.length === 0) return;

  const transcript = messages
    .map(
      (m) =>
        `[id=${m.id}] ${m.sender_kind === "ai" ? `[AI] ${m.sender}` : m.sender}: ${m.content}`,
    )
    .join("\n");

  const loggedSummary = existing
    .slice(-20)
    .map(
      (p) =>
        `- (msg ${p.source_message_id}) ${p.administrator} → ${p.inmate}: ${p.punishment}`,
    )
    .join("\n");

  const system = `You are a record-keeping system for a prison roleplay. You output ONLY JSON.

A "punishment" is a disciplinary action that was ACTUALLY ADMINISTERED in the transcript — physical force used, restraints applied, an inmate placed in solitary, lashes given, privileges revoked and enforced, etc. Do NOT log:
- Verbal commands, threats, or warnings (e.g. "stop, or you'll be punished")
- Orders that the transcript does not show being carried out
- Routine procedures (counts, escorts, lockdowns) unless they are clearly punitive
- Punishments that have already been logged (see "Already logged" below)

For each punishment that was carried out, output:
{ "source_message_id": <number>, "inmate": "<exact name as it appears>", "punishment": "<short phrase, e.g. 'Solitary confinement, 24 hours' or '5 lashes'>", "administrator": "<exact name of the officer/guard who administered it>" }

source_message_id MUST be the id of the message in which the punishment was administered (the [id=X] tag in the transcript). Pick the message where the action is most clearly carried out, not earlier setup.

Output schema:
{ "punishments": [ ... ] }

Output an empty array if nothing new was administered:
{ "punishments": [] }

Output JSON ONLY. No prose.`;

  const user = `Already logged (don't repeat these — the source_message_id is in parentheses):
${loggedSummary || "- (none yet)"}

Transcript (oldest first, last ${messages.length} IC messages):
${transcript}

Return JSON for newly-administered punishments now.`;

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
    console.error("punishment scan failed:", err);
    return;
  }

  const items = Array.isArray(result.punishments) ? result.punishments : [];
  const messageIds = new Set(messages.map((m) => m.id));

  for (const item of items) {
    const sourceId = Number(item.source_message_id);
    if (!Number.isFinite(sourceId) || !messageIds.has(sourceId)) continue;
    const inmate = typeof item.inmate === "string" ? item.inmate.trim() : "";
    const punishment =
      typeof item.punishment === "string" ? item.punishment.trim() : "";
    const administrator =
      typeof item.administrator === "string" ? item.administrator.trim() : "";
    if (!inmate || !punishment || !administrator) continue;
    if (alreadyLogged.has(sourceId)) continue;

    const sourceMsg = messages.find((m) => m.id === sourceId);
    const occurredAt = sourceMsg ? sourceMsg.created_at : Date.now();

    await insertPunishment(roomId, {
      source_message_id: sourceId,
      inmate,
      punishment,
      administrator,
      occurred_at: occurredAt,
    }).catch((e) => console.error("failed to insert punishment:", e));
  }
}
