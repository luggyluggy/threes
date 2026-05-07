import { NextResponse } from "next/server";
import { getAllUserPersonas, getMessages, getRoom } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const oocSince = Number(url.searchParams.get("oocSince") || 0) || 0;
  const icSince = Number(url.searchParams.get("icSince") || 0) || 0;

  const [room, ooc, ic, userPersonas] = await Promise.all([
    getRoom(),
    getMessages("ooc", oocSince),
    getMessages("ic", icSince),
    getAllUserPersonas(),
  ]);

  const users: Record<string, string> = {};
  for (const p of userPersonas) users[p.name] = p.persona;

  return NextResponse.json({
    ooc,
    ic,
    room: {
      initialized: !!room,
      aiName: room?.ai_name ?? null,
      aiMuted: room?.ai_muted ?? false,
      aiTyping: room?.ai_typing ?? false,
    },
    personas: {
      ai: room?.persona ?? null,
      users,
    },
  });
}
