import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_DIR = path.join(process.cwd(), ".data");
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, "threes.db");

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  const d = new Database(DB_PATH);
  d.pragma("journal_mode = WAL");
  d.exec(`
    CREATE TABLE IF NOT EXISTS room (
      id TEXT PRIMARY KEY,
      ai_name TEXT,
      persona TEXT,
      ai_muted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      sender TEXT NOT NULL,
      sender_kind TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_room_channel
      ON messages (room_id, channel, id);
  `);
  _db = d;
  return d;
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
  ai_muted: number;
  created_at: number | null;
}

export function getRoom(): Room | null {
  return (db().prepare("SELECT * FROM room WHERE id = ?").get(ROOM_ID) as Room | undefined) ?? null;
}

export function setupRoom(aiName: string, persona: string): Room {
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO room (id, ai_name, persona, ai_muted, created_at)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(ROOM_ID, aiName, persona, now);
  return getRoom()!;
}

export function setMuted(muted: boolean): void {
  db().prepare("UPDATE room SET ai_muted = ? WHERE id = ?").run(muted ? 1 : 0, ROOM_ID);
}

export function insertMessage(
  channel: Channel,
  sender: string,
  senderKind: SenderKind,
  content: string,
): Message {
  const now = Date.now();
  const info = db()
    .prepare(
      `INSERT INTO messages (room_id, channel, sender, sender_kind, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(ROOM_ID, channel, sender, senderKind, content, now);
  return {
    id: Number(info.lastInsertRowid),
    room_id: ROOM_ID,
    channel,
    sender,
    sender_kind: senderKind,
    content,
    created_at: now,
  };
}

export function getMessages(channel: Channel, sinceId = 0, limit = 500): Message[] {
  return db()
    .prepare(
      `SELECT * FROM messages
       WHERE room_id = ? AND channel = ? AND id > ?
       ORDER BY id ASC
       LIMIT ?`,
    )
    .all(ROOM_ID, channel, sinceId, limit) as Message[];
}
