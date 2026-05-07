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

export async function setTyping(typing: boolean): Promise<void> {
  await sql`UPDATE room SET ai_typing = ${typing} WHERE id = ${ROOM_ID}`;
}

/**
 * Atomic compare-and-set on ai_typing. Returns true if we acquired the lock
 * (typing was false, now true). Returns false if another invocation already holds it.
 */
export async function tryAcquireTyping(): Promise<boolean> {
  const rows = await sql<{ ai_typing: boolean }>`
    UPDATE room
    SET ai_typing = TRUE
    WHERE id = ${ROOM_ID} AND ai_typing = FALSE
    RETURNING ai_typing
  `;
  return rows.length > 0;
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
