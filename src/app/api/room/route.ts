import { NextResponse } from "next/server";
import { getRoom, setMuted, setRoomPersona } from "@/lib/db";
import { getIdentity } from "@/lib/identity";

export async function GET(): Promise<NextResponse> {
  const identity = await getIdentity();
  if (!identity)
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const room = await getRoom(identity.prisonId);
  return NextResponse.json({
    initialized: !!room,
    aiName: room?.ai_name ?? null,
    aiMuted: room?.ai_muted ?? false,
    aiTyping: room?.ai_typing ?? false,
  });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const identity = await getIdentity();
  if (!identity)
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    aiMuted?: unknown;
    persona?: unknown;
  };

  let touched = false;

  if (typeof body.aiMuted === "boolean") {
    await setMuted(identity.prisonId, body.aiMuted);
    touched = true;
  }

  if (typeof body.persona === "string") {
    const persona = body.persona.trim();
    if (!persona) return NextResponse.json({ error: "persona cannot be empty" }, { status: 400 });
    if (persona.length > 4000)
      return NextResponse.json({ error: "persona too long" }, { status: 400 });
    await setRoomPersona(identity.prisonId, persona);
    touched = true;
  }

  if (!touched) return NextResponse.json({ error: "no changes" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
