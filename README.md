# Threes

A three-way chat room: two humans + one xAI-powered AI.

Two channels:
- **OOC** — out of character. Just the two humans. The AI never sees these messages.
- **IC** — in character. The AI replies after every human message, unless muted.

## Setup

1. Copy env: `cp .env.local.example .env.local`
2. Set `XAI_API_KEY` (and optionally `XAI_MODEL`, defaults to `grok-4`).
3. `npm install`
4. `npm run dev`
5. Open `http://localhost:3000`.

The first visitor picks a name. Whoever lands while the room is uninitialized
will be prompted to set the AI's name and persona — these are **fixed for the
lifetime of the room**. The second human just claims a name and joins. Either
human can mute the AI from the room header (mute is shared, not per-user).

## Reset

Delete `.data/threes.db` to wipe identities aside, the room and all history.

## Notes

- Identity is a cookie. There is no auth — anyone with the URL can claim any
  name. This is by design (trusted users only).
- Live updates use Server-Sent Events. The dev server and a typical
  long-running Node host (Fly, Railway, a VPS) work fine. Vercel's serverless
  function timeout will cut SSE streams; reconnects are automatic but you may
  see brief gaps.
