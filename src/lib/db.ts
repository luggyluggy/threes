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
        created_at BIGINT,
        typing_since BIGINT,
        last_punishment_scan_id BIGINT
      )
    `;
    // Backfill columns on rooms created with the older shape.
    await sql`ALTER TABLE room ADD COLUMN IF NOT EXISTS typing_since BIGINT`;
    await sql`ALTER TABLE room ADD COLUMN IF NOT EXISTS last_punishment_scan_id BIGINT`;
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
        room_id TEXT NOT NULL,
        name TEXT NOT NULL,
        persona TEXT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (room_id, name)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS character_positions (
        room_id TEXT NOT NULL,
        character_name TEXT NOT NULL,
        location_room_id TEXT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (room_id, character_name)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id BIGSERIAL PRIMARY KEY,
        room_id TEXT NOT NULL,
        trigger_note TEXT NOT NULL,
        scheduled_for BIGINT NOT NULL,
        executed_at BIGINT,
        created_at BIGINT NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS punishments (
        id BIGSERIAL PRIMARY KEY,
        room_id TEXT NOT NULL,
        source_message_id BIGINT NOT NULL UNIQUE,
        inmate TEXT NOT NULL,
        punishment TEXT NOT NULL,
        administrator TEXT NOT NULL,
        occurred_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_punishments_room
        ON punishments (room_id, occurred_at, id)
    `;
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

export async function getRoom(roomId: string): Promise<Room | null> {
  const rows = await sql<RoomRow>`SELECT * FROM room WHERE id = ${roomId}`;
  return rows[0] ? normalizeRoom(rows[0]) : null;
}

export async function setupRoom(
  roomId: string,
  aiName: string,
  persona: string,
): Promise<Room> {
  const now = Date.now();
  await sql`
    INSERT INTO room (id, ai_name, persona, ai_muted, ai_typing, created_at)
    VALUES (${roomId}, ${aiName}, ${persona}, FALSE, FALSE, ${now})
    ON CONFLICT (id) DO NOTHING
  `;
  const r = await getRoom(roomId);
  if (!r) throw new Error("setupRoom: room missing after insert");
  return r;
}

export async function setMuted(roomId: string, muted: boolean): Promise<void> {
  await sql`UPDATE room SET ai_muted = ${muted} WHERE id = ${roomId}`;
}

export const TYPING_LOCK_TTL_MS = 90_000;

export async function setTyping(roomId: string, typing: boolean): Promise<void> {
  if (typing) {
    const now = Date.now();
    await sql`
      UPDATE room SET ai_typing = TRUE, typing_since = ${now} WHERE id = ${roomId}
    `;
  } else {
    await sql`
      UPDATE room SET ai_typing = FALSE, typing_since = NULL WHERE id = ${roomId}
    `;
  }
}

/**
 * Atomic compare-and-set on ai_typing with TTL-based stale-lock takeover.
 */
export async function tryAcquireTyping(roomId: string): Promise<boolean> {
  const now = Date.now();
  const cutoff = now - TYPING_LOCK_TTL_MS;
  const rows = await sql<{ ai_typing: boolean }>`
    UPDATE room
    SET ai_typing = TRUE, typing_since = ${now}
    WHERE id = ${roomId}
      AND (
        ai_typing = FALSE
        OR typing_since IS NULL
        OR typing_since < ${cutoff}
      )
    RETURNING ai_typing
  `;
  return rows.length > 0;
}

export async function refreshTyping(roomId: string): Promise<void> {
  const now = Date.now();
  await sql`
    UPDATE room SET typing_since = ${now}
    WHERE id = ${roomId} AND ai_typing = TRUE
  `;
}

export async function clearStaleTyping(roomId: string): Promise<void> {
  const cutoff = Date.now() - TYPING_LOCK_TTL_MS;
  await sql`
    UPDATE room
    SET ai_typing = FALSE, typing_since = NULL
    WHERE id = ${roomId}
      AND ai_typing = TRUE
      AND (typing_since IS NULL OR typing_since < ${cutoff})
  `;
}

export async function insertMessage(
  roomId: string,
  channel: Channel,
  sender: string,
  senderKind: SenderKind,
  content: string,
): Promise<Message> {
  const now = Date.now();
  const rows = await sql<MessageRow>`
    INSERT INTO messages (room_id, channel, sender, sender_kind, content, created_at)
    VALUES (${roomId}, ${channel}, ${sender}, ${senderKind}, ${content}, ${now})
    RETURNING *
  `;
  return normalizeMessage(rows[0]);
}

export async function setRoomPersona(roomId: string, persona: string): Promise<void> {
  await sql`UPDATE room SET persona = ${persona} WHERE id = ${roomId}`;
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

export async function getUserPersona(
  roomId: string,
  name: string,
): Promise<UserPersona | null> {
  const rows = await sql<UserPersonaRow>`
    SELECT name, persona, updated_at FROM user_personas
    WHERE room_id = ${roomId} AND name = ${name}
  `;
  return rows[0] ? normalizeUserPersona(rows[0]) : null;
}

export async function setUserPersona(
  roomId: string,
  name: string,
  persona: string,
): Promise<void> {
  const now = Date.now();
  await sql`
    INSERT INTO user_personas (room_id, name, persona, updated_at)
    VALUES (${roomId}, ${name}, ${persona}, ${now})
    ON CONFLICT (room_id, name) DO UPDATE
      SET persona = EXCLUDED.persona,
          updated_at = EXCLUDED.updated_at
  `;
}

export async function getAllUserPersonas(roomId: string): Promise<UserPersona[]> {
  const rows = await sql<UserPersonaRow>`
    SELECT name, persona, updated_at FROM user_personas
    WHERE room_id = ${roomId}
    ORDER BY name
  `;
  return rows.map(normalizeUserPersona);
}

export interface CharacterPosition {
  character_name: string;
  /** The map room id (e.g. "yard"), not the prison id. */
  location_room_id: string;
  updated_at: number;
}

interface CharacterPositionRow {
  character_name: string;
  location_room_id: string;
  updated_at: string | number;
}

export async function getPositions(roomId: string): Promise<CharacterPosition[]> {
  const rows = await sql<CharacterPositionRow>`
    SELECT character_name, location_room_id, updated_at FROM character_positions
    WHERE room_id = ${roomId}
    ORDER BY character_name
  `;
  return rows.map((r) => ({
    character_name: r.character_name,
    location_room_id: r.location_room_id,
    updated_at: Number(r.updated_at),
  }));
}

export async function setPosition(
  roomId: string,
  characterName: string,
  locationRoomId: string,
): Promise<void> {
  const now = Date.now();
  await sql`
    INSERT INTO character_positions (room_id, character_name, location_room_id, updated_at)
    VALUES (${roomId}, ${characterName}, ${locationRoomId}, ${now})
    ON CONFLICT (room_id, character_name) DO UPDATE
      SET location_room_id = EXCLUDED.location_room_id,
          updated_at = EXCLUDED.updated_at
  `;
}

export async function getMessages(
  roomId: string,
  channel: Channel,
  sinceId = 0,
  limit = 500,
): Promise<Message[]> {
  const rows = await sql<MessageRow>`
    SELECT * FROM messages
    WHERE room_id = ${roomId} AND channel = ${channel} AND id > ${sinceId}
    ORDER BY id ASC
    LIMIT ${limit}
  `;
  return rows.map(normalizeMessage);
}

export async function getRecentMessages(
  roomId: string,
  channel: Channel,
  limit: number,
): Promise<Message[]> {
  const rows = await sql<MessageRow>`
    SELECT * FROM (
      SELECT * FROM messages
      WHERE room_id = ${roomId} AND channel = ${channel}
      ORDER BY id DESC
      LIMIT ${limit}
    ) AS t
    ORDER BY id ASC
  `;
  return rows.map(normalizeMessage);
}

export interface ScheduledTask {
  id: number;
  room_id: string;
  trigger_note: string;
  scheduled_for: number;
  executed_at: number | null;
  created_at: number;
}

interface ScheduledTaskRow {
  id: string | number;
  room_id: string;
  trigger_note: string;
  scheduled_for: string | number;
  executed_at: string | number | null;
  created_at: string | number;
}

function normalizeScheduledTask(r: ScheduledTaskRow): ScheduledTask {
  return {
    id: Number(r.id),
    room_id: r.room_id,
    trigger_note: r.trigger_note,
    scheduled_for: Number(r.scheduled_for),
    executed_at: r.executed_at == null ? null : Number(r.executed_at),
    created_at: Number(r.created_at),
  };
}

export async function insertScheduledTask(
  roomId: string,
  triggerNote: string,
  scheduledFor: number,
): Promise<ScheduledTask> {
  const now = Date.now();
  const rows = await sql<ScheduledTaskRow>`
    INSERT INTO scheduled_tasks (room_id, trigger_note, scheduled_for, created_at)
    VALUES (${roomId}, ${triggerNote}, ${scheduledFor}, ${now})
    RETURNING *
  `;
  return normalizeScheduledTask(rows[0]);
}

export async function claimDueTasks(roomId: string): Promise<ScheduledTask[]> {
  const now = Date.now();
  const rows = await sql<ScheduledTaskRow>`
    UPDATE scheduled_tasks
    SET executed_at = ${now}
    WHERE room_id = ${roomId}
      AND scheduled_for <= ${now}
      AND executed_at IS NULL
    RETURNING *
  `;
  return rows.map(normalizeScheduledTask);
}

export interface Punishment {
  id: number;
  room_id: string;
  source_message_id: number;
  inmate: string;
  punishment: string;
  administrator: string;
  occurred_at: number;
  created_at: number;
}

interface PunishmentRow {
  id: string | number;
  room_id: string;
  source_message_id: string | number;
  inmate: string;
  punishment: string;
  administrator: string;
  occurred_at: string | number;
  created_at: string | number;
}

function normalizePunishment(r: PunishmentRow): Punishment {
  return {
    id: Number(r.id),
    room_id: r.room_id,
    source_message_id: Number(r.source_message_id),
    inmate: r.inmate,
    punishment: r.punishment,
    administrator: r.administrator,
    occurred_at: Number(r.occurred_at),
    created_at: Number(r.created_at),
  };
}

export async function insertPunishment(
  roomId: string,
  p: {
    source_message_id: number;
    inmate: string;
    punishment: string;
    administrator: string;
    occurred_at: number;
  },
): Promise<Punishment | null> {
  const now = Date.now();
  const rows = await sql<PunishmentRow>`
    INSERT INTO punishments
      (room_id, source_message_id, inmate, punishment, administrator, occurred_at, created_at)
    VALUES
      (${roomId}, ${p.source_message_id}, ${p.inmate}, ${p.punishment},
       ${p.administrator}, ${p.occurred_at}, ${now})
    ON CONFLICT (source_message_id) DO NOTHING
    RETURNING *
  `;
  return rows[0] ? normalizePunishment(rows[0]) : null;
}

export async function getPunishments(
  roomId: string,
  limit = 100,
): Promise<Punishment[]> {
  const rows = await sql<PunishmentRow>`
    SELECT * FROM punishments
    WHERE room_id = ${roomId}
    ORDER BY occurred_at ASC, id ASC
    LIMIT ${limit}
  `;
  return rows.map(normalizePunishment);
}

export async function getLastPunishmentScanId(roomId: string): Promise<number> {
  const rows = await sql<{ last_punishment_scan_id: string | number | null }>`
    SELECT last_punishment_scan_id FROM room WHERE id = ${roomId}
  `;
  const v = rows[0]?.last_punishment_scan_id;
  return v == null ? 0 : Number(v);
}

export async function setLastPunishmentScanId(
  roomId: string,
  id: number,
): Promise<void> {
  await sql`
    UPDATE room SET last_punishment_scan_id = ${id} WHERE id = ${roomId}
  `;
}

export async function getLatestIcMessageId(roomId: string): Promise<number> {
  const rows = await sql<{ id: string | number | null }>`
    SELECT MAX(id) AS id FROM messages
    WHERE room_id = ${roomId} AND channel = 'ic'
  `;
  const v = rows[0]?.id;
  return v == null ? 0 : Number(v);
}
