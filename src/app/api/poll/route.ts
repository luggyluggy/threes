import { NextResponse } from "next/server";
import { getMessages, getRoom } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const oocSince = Number(url.searchParams.get("oocSince") || 0) || 0;
  const icSince = Number(url.searchParams.get("icSince") || 0) || 0;

  const [room, ooc, ic] = await Promise.all([
    getRoom(),
    getMessages("ooc", oocSince),
    getMessages("ic", icSince),
  ]);

  return NextResponse.json({
    ooc,
    ic,
    room: {
      initialized: !!room,
      aiName: room?.ai_name ?? null,
      aiMuted: room?.ai_muted ?? false,
      aiTyping: room?.ai_typing ?? false,
    },
  });
}
