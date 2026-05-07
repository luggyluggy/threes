import { neon } from "@neondatabase/serverless";

function connectionString(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Provision a Neon database (or use Vercel's Storage tab) and set DATABASE_URL.",
    );
  }
  return url;
}

let _sql: ReturnType<typeof neon> | null = null;
let _schemaReady: Promise<void> | null = null;

function sqlClient(): ReturnType<typeof neon> {
  if (!_sql) _sql = neon(connectionString());
  return _sql;
}

async function ensureSchema(): Promise<void> {
  if (_schemaReady) return _schemaReady;
  _schemaReady = (async () => {
    const sql = sqlClient();
    await sql`
      CREATE TABLE IF NOT EXISTS room (
        id TEXT PRIMARY KEY,
        ai_name TEXT,
        persona TEXT,
        ai_muted BOOLEAN NOT NULL DEFAULT FALSE,
        ai_typing BOOLEAN NOT NULL DEFAULT FALSE,
        created_at BIGINT
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id BIGSERIAL PRIMARY KEY,
        room_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        sender TEXT NOT NULL,
        sender_kind TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_messages_room_channel
        ON messages (room_id, channel, id)
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS user_personas (
        name TEXT PRIMARY KEY,
        persona TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS character_positions (
        character_name TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id BIGSERIAL PRIMARY KEY,
        trigger_note TEXT NOT NULL,
        scheduled_for BIGINT NOT NULL,
        executed_at BIGINT,
        created_at BIGINT NOT NULL
      )
    `;
    // Heartbeat for the AI typing lock: lets us auto-recover if a serverless
    // function is killed mid-response and never reaches its finally.
    await sql`ALTER TABLE room ADD COLUMN IF NOT EXISTS typing_since BIGINT`;
  })().catch((err) => {
    _schemaReady = null;
    throw err;
  });
  return _schemaReady;
}

async function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...params: unknown[]
): Promise<T[]> {
  await ensureSchema();
  return sqlClient()(strings, ...params) as Promise<T[]>;
}

export const ROOM_ID = "main";

export type Channel = "ooc" | "ic";
export type SenderKind = "human" | "ai";

export interface Message {
  id: number;
  room_id: string;
  channel: Channel;
  sender: string;
  sender_kind: SenderKind;
  content: string;
  created_at: number;
}

export interface Room {
  id: string;
  ai_name: string | null;
  persona: string | null;
  ai_muted: boolean;
  ai_typing: boolean;
  created_at: number | null;
}

interface RoomRow {
  id: string;
  ai_name: string | null;
  persona: string | null;
  ai_muted: boolean;
  ai_typing: boolean;
  created_at: string | number | null;
}

interface MessageRow {
  id: string | number;
  room_id: string;
  channel: string;
  sender: string;
  sender_kind: string;
  content: string;
  created_at: string | number;
}

function normalizeRoom(r: RoomRow): Room {
  return {
    id: r.id,
    ai_name: r.ai_name,
    persona: r.persona,
    ai_muted: !!r.ai_muted,
    ai_typing: !!r.ai_typing,
    created_at: r.created_at == null ? null : Number(r.created_at),
  };
}

function normalizeMessage(m: MessageRow): Message {
  return {
    id: Number(m.id),
    room_id: m.room_id,
    channel: m.channel as Channel,
    sender: m.sender,
    sender_kind: m.sender_kind as SenderKind,
    content: m.content,
    created_at: Number(m.created_at),
  };
}

export async function getRoom(): Promise<Room | null> {
  const rows = await sql<RoomRow>`SELECT * FROM room WHERE id = ${ROOM_ID}`;
  return rows[0] ? normalizeRoom(rows[0]) : null;
}

export async function setupRoom(aiName: string, persona: string): Promise<Room> {
  const now = Date.now();
  await sql`
    INSERT INTO room (id, ai_name, persona, ai_muted, ai_typing, created_at)
    VALUES (${ROOM_ID}, ${aiName}, ${persona}, FALSE, FALSE, ${now})
    ON CONFLICT (id) DO NOTHING
  `;
  const r = await getRoom();
  if (!r) throw new Error("setupRoom: room missing after insert");
  return r;
}

export async function setMuted(muted: boolean): Promise<void> {
  await sql`UPDATE room SET ai_muted = ${muted} WHERE id = ${ROOM_ID}`;
}

// If a typing lock is older than this, treat it as stale and let the next
// caller steal it. Vercel's maxDuration on this app's routes is 60s, so 90s
// gives healthy responses room while still recovering quickly from crashes.
export const TYPING_LOCK_TTL_MS = 90_000;

export async function setTyping(typing: boolean): Promise<void> {
  if (typing) {
    const now = Date.now();
    await sql`
      UPDATE room SET ai_typing = TRUE, typing_since = ${now} WHERE id = ${ROOM_ID}
    `;
  } else {
    await sql`
      UPDATE room SET ai_typing = FALSE, typing_since = NULL WHERE id = ${ROOM_ID}
    `;
  }
}

/**
 * Atomic compare-and-set on ai_typing with TTL-based stale-lock takeover.
 * Returns true if we hold the lock after this call. Also refreshes
 * typing_since so concurrent stale-lock readers don't both think they hold it.
 */
export async function tryAcquireTyping(): Promise<boolean> {
  const now = Date.now();
  const cutoff = now - TYPING_LOCK_TTL_MS;
  const rows = await sql<{ ai_typing: boolean }>`
    UPDATE room
    SET ai_typing = TRUE, typing_since = ${now}
    WHERE id = ${ROOM_ID}
      AND (
        ai_typing = FALSE
        OR typing_since IS NULL
        OR typing_since < ${cutoff}
      )
    RETURNING ai_typing
  `;
  return rows.length > 0;
}

/**
 * Best-effort heartbeat — call periodically inside a long-running AI loop so
 * other workers don't steal the lock mid-response.
 */
export async function refreshTyping(): Promise<void> {
  const now = Date.now();
  await sql`
    UPDATE room SET typing_since = ${now}
    WHERE id = ${ROOM_ID} AND ai_typing = TRUE
  `;
}

/**
 * Clear the typing lock if it's been held longer than TYPING_LOCK_TTL_MS —
 * almost certainly a crashed/timed-out worker. Safe to call from any path
 * that's about to read ai_typing.
 */
export async function clearStaleTyping(): Promise<void> {
  const cutoff = Date.now() - TYPING_LOCK_TTL_MS;
  await sql`
    UPDATE room
    SET ai_typing = FALSE, typing_since = NULL
    WHERE id = ${ROOM_ID}
      AND ai_typing = TRUE
      AND (typing_since IS NULL OR typing_since < ${cutoff})
  `;
}

export async function insertMessage(
  channel: Channel,
  sender: string,
  senderKind: SenderKind,
  content: string,
): Promise<Message> {
  const now = Date.now();
  const rows = await sql<MessageRow>`
    INSERT INTO messages (room_id, channel, sender, sender_kind, content, created_at)
    VALUES (${ROOM_ID}, ${channel}, ${sender}, ${senderKind}, ${content}, ${now})
    RETURNING *
  `;
  return normalizeMessage(rows[0]);
}

export async function setRoomPersona(persona: string): Promise<void> {
  await sql`UPDATE room SET persona = ${persona} WHERE id = ${ROOM_ID}`;
}

export interface UserPersona {
  name: string;
  persona: string;
  updated_at: number;
}

interface UserPersonaRow {
  name: string;
  persona: string;
  updated_at: string | number;
}

function normalizeUserPersona(r: UserPersonaRow): UserPersona {
  return { name: r.name, persona: r.persona, updated_at: Number(r.updated_at) };
}

export async function getUserPersona(name: string): Promise<UserPersona | null> {
  const rows = await sql<UserPersonaRow>`
    SELECT * FROM user_personas WHERE name = ${name}
  `;
  return rows[0] ? normalizeUserPersona(rows[0]) : null;
}

export async function setUserPersona(name: string, persona: string): Promise<void> {
  const now = Date.now();
  await sql`
    INSERT INTO user_personas (name, persona, updated_at)
    VALUES (${name}, ${persona}, ${now})
    ON CONFLICT (name) DO UPDATE
      SET persona = EXCLUDED.persona,
          updated_at = EXCLUDED.updated_at
  `;
}

export async function getAllUserPersonas(): Promise<UserPersona[]> {
  const rows = await sql<UserPersonaRow>`SELECT * FROM user_personas ORDER BY name`;
  return rows.map(normalizeUserPersona);
}

export interface CharacterPosition {
  character_name: string;
  room_id: string;
  updated_at: number;
}

interface CharacterPositionRow {
  character_name: string;
  room_id: string;
  updated_at: string | number;
}

export async function getPositions(): Promise<CharacterPosition[]> {
  const rows = await sql<CharacterPositionRow>`
    SELECT * FROM character_positions ORDER BY character_name
  `;
  return rows.map((r) => ({
    character_name: r.character_name,
    room_id: r.room_id,
    updated_at: Number(r.updated_at),
  }));
}

export async function setPosition(characterName: string, roomId: string): Promise<void> {
  const now = Date.now();
  await sql`
    INSERT INTO character_positions (character_name, room_id, updated_at)
    VALUES (${characterName}, ${roomId}, ${now})
    ON CONFLICT (character_name) DO UPDATE
      SET room_id = EXCLUDED.room_id,
          updated_at = EXCLUDED.updated_at
  `;
}

export async function getMessages(
  channel: Channel,
  sinceId = 0,
  limit = 500,
): Promise<Message[]> {
  const rows = await sql<MessageRow>`
    SELECT * FROM messages
    WHERE room_id = ${ROOM_ID} AND channel = ${channel} AND id > ${sinceId}
    ORDER BY id ASC
    LIMIT ${limit}
  `;
  return rows.map(normalizeMessage);
}

export interface ScheduledTask {
  id: number;
  trigger_note: string;
  scheduled_for: number;
  executed_at: number | null;
  created_at: number;
}

interface ScheduledTaskRow {
  id: string | number;
  trigger_note: string;
  scheduled_for: string | number;
  executed_at: string | number | null;
  created_at: string | number;
}

function normalizeScheduledTask(r: ScheduledTaskRow): ScheduledTask {
  return {
    id: Number(r.id),
    trigger_note: r.trigger_note,
    scheduled_for: Number(r.scheduled_for),
    executed_at: r.executed_at == null ? null : Number(r.executed_at),
    created_at: Number(r.created_at),
  };
}

export async function insertScheduledTask(
  triggerNote: string,
  scheduledFor: number,
): Promise<ScheduledTask> {
  const now = Date.now();
  const rows = await sql<ScheduledTaskRow>`
    INSERT INTO scheduled_tasks (trigger_note, scheduled_for, created_at)
    VALUES (${triggerNote}, ${scheduledFor}, ${now})
    RETURNING *
  `;
  return normalizeScheduledTask(rows[0]);
}

export async function claimDueTasks(): Promise<ScheduledTask[]> {
  const now = Date.now();
  const rows = await sql<ScheduledTaskRow>`
    UPDATE scheduled_tasks
    SET executed_at = ${now}
    WHERE scheduled_for <= ${now} AND executed_at IS NULL
    RETURNING *
  `;
  return rows.map(normalizeScheduledTask);
}
