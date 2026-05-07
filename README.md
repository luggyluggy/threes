# Threes

A three-way chat room: two humans + one xAI-powered AI. Built for Vercel.

Two channels:
- **OOC** — out of character. Just the two humans. The AI never sees these.
- **IC** — in character. The AI replies after every human message, unless muted.

## Local development

1. `cp .env.local.example .env.local` and fill in:
   - `DATABASE_URL` — a Neon Postgres connection string (free tier at https://neon.tech)
   - `XAI_API_KEY` — your xAI key
   - `XAI_MODEL` — defaults to `grok-4`
2. `npm install`
3. `npm run dev`
4. Open `http://localhost:3000`.

The first visitor picks a name. Whoever lands while the room is uninitialized
will be prompted to set the AI's name and persona — these are **fixed for the
lifetime of the room**. The second human just claims a name and joins. Either
human can mute the AI from the room header (mute is shared, not per-user).

To reset: `DROP TABLE room, messages` (or just delete + recreate the Neon
branch). Schema is recreated automatically on next request.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: **New Project** → import the repo. Don't deploy yet.
3. **Storage** tab → **Create Database** → **Neon**. This automatically injects
   `DATABASE_URL` (and friends) into the project.
4. **Settings → Environment Variables**, add:
   - `XAI_API_KEY` — your xAI key
   - `XAI_MODEL` — e.g. `grok-4` (optional, defaults to `grok-4`)
5. **Deploy**.

That's it — schema is created lazily on the first request.

### Function timeout caveat

The AI generation runs in `after()`, which extends the function lifetime past
the user-facing response. The route is set to `maxDuration = 60`. On the Hobby
plan that's the maximum; on Pro you can raise it. If a Grok response takes
longer than `maxDuration`, the function is killed mid-generation and no AI
message is posted (the human's message still went through).

## Architecture notes

- **Storage**: Neon Postgres via `@neondatabase/serverless` (HTTP fetch — no
  pool, no cold-start cost).
- **Realtime**: client polling at 1.5s intervals via `/api/poll`. After a user
  sends a message, the client triggers an immediate poll for snappier feedback.
- **AI orchestration**: `runAILoop()` in `src/lib/ai.ts` runs inside `after()`.
  A DB-level lock (`room.ai_typing` atomic compare-and-set) serializes
  generations across concurrent function invocations. The loop continues
  while new human messages have arrived, so a fast human back-and-forth still
  gets handled.
- **Identity**: cookie-based, no auth. Anyone with the URL can claim any name.
  This is by design — both humans are trusted.
