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

const before = {
  messages: (await sql`SELECT COUNT(*)::int AS n FROM messages`)[0].n,
  user_personas: (await sql`SELECT COUNT(*)::int AS n FROM user_personas`)[0].n,
  character_positions: (await sql`SELECT COUNT(*)::int AS n FROM character_positions`)[0].n,
};
console.log("before:", before);

await sql`TRUNCATE TABLE messages RESTART IDENTITY`;
await sql`TRUNCATE TABLE user_personas`;
await sql`TRUNCATE TABLE character_positions`;

const after = {
  messages: (await sql`SELECT COUNT(*)::int AS n FROM messages`)[0].n,
  user_personas: (await sql`SELECT COUNT(*)::int AS n FROM user_personas`)[0].n,
  character_positions: (await sql`SELECT COUNT(*)::int AS n FROM character_positions`)[0].n,
};
console.log("after: ", after);
console.log("done");
