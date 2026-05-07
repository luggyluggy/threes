import { NextResponse } from "next/server";
import { after } from "next/server";
import { getMessages, getRoom, insertMessage, type Channel } from "@/lib/db";
import { getName } from "@/lib/identity";
import { runAILoop } from "@/lib/ai";

export const maxDuration = 60;

function parseChannel(value: string | null): Channel | null {
  return value === "ooc" || value === "ic" ? value : null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const channel = parseChannel(url.searchParams.get("channel"));
  if (!channel) return NextResponse.json({ error: "invalid channel" }, { status: 400 });
  const sinceId = Number(url.searchParams.get("sinceId") || 0) || 0;
  const messages = await getMessages(channel, sinceId);
  return NextResponse.json({ messages });
}

export async function POST(req: Request): Promise<NextResponse> {
  const name = await getName();
  if (!name) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const room = await getRoom();
  if (!room) return NextResponse.json({ error: "room not initialized" }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as {
    channel?: unknown;
    content?: unknown;
  };
  const channel = parseChannel(typeof body.channel === "string" ? body.channel : null);
  if (!channel) return NextResponse.json({ error: "invalid channel" }, { status: 400 });
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });
  if (content.length > 4000)
    return NextResponse.json({ error: "content too long" }, { status: 400 });

  const msg = await insertMessage(channel, name, "human", content);

  if (channel === "ic" && !room.ai_muted) {
    after(async () => {
      try {
        await runAILoop();
      } catch (err) {
        console.error("AI loop error:", err);
      }
    });
  }

  return NextResponse.json({ message: msg });
}
