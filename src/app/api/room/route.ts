import { NextResponse } from "next/server";
import { getRoom, setMuted, setRoomPersona, setupRoom } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  const room = await getRoom();
  return NextResponse.json({
    initialized: !!room,
    aiName: room?.ai_name ?? null,
    aiMuted: room?.ai_muted ?? false,
    aiTyping: room?.ai_typing ?? false,
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (await getRoom())
    return NextResponse.json({ error: "already initialized" }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { aiName?: unknown; persona?: unknown };
  const aiName = typeof body.aiName === "string" ? body.aiName.trim() : "";
  const persona = typeof body.persona === "string" ? body.persona.trim() : "";
  if (!aiName) return NextResponse.json({ error: "aiName required" }, { status: 400 });
  if (!persona) return NextResponse.json({ error: "persona required" }, { status: 400 });
  if (aiName.length > 40) return NextResponse.json({ error: "aiName too long" }, { status: 400 });
  await setupRoom(aiName, persona);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as {
    aiMuted?: unknown;
    persona?: unknown;
  };

  let touched = false;

  if (typeof body.aiMuted === "boolean") {
    await setMuted(body.aiMuted);
    touched = true;
  }

  if (typeof body.persona === "string") {
    const persona = body.persona.trim();
    if (!persona) return NextResponse.json({ error: "persona cannot be empty" }, { status: 400 });
    if (persona.length > 4000)
      return NextResponse.json({ error: "persona too long" }, { status: 400 });
    await setRoomPersona(persona);
    touched = true;
  }

  if (!touched) return NextResponse.json({ error: "no changes" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
