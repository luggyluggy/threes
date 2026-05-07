import { neon } from "@neondatabase/serverless";

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  console.error("DATABASE_URL is not set. Run with --env-file=.env.local");
  process.exit(1);
}

const sql = neon(url);

// DROP rather than TRUNCATE so ensureSchema can recreate tables with the
// current shape (composite PKs, new room_id columns, etc.).
await sql`DROP TABLE IF EXISTS punishments CASCADE`;
await sql`DROP TABLE IF EXISTS scheduled_tasks CASCADE`;
await sql`DROP TABLE IF EXISTS character_positions CASCADE`;
await sql`DROP TABLE IF EXISTS user_personas CASCADE`;
await sql`DROP TABLE IF EXISTS messages CASCADE`;
await sql`DROP TABLE IF EXISTS room CASCADE`;

console.log("dropped all tables — next request will recreate via ensureSchema()");
