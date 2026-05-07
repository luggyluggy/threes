import { NextResponse } from "next/server";
import { getRoom, setMuted, setupRoom } from "@/lib/db";
import { publish } from "@/lib/events";

export async function GET(): Promise<NextResponse> {
  const room = getRoom();
  return NextResponse.json({
    initialized: !!room,
    aiName: room?.ai_name ?? null,
    aiMuted: room ? !!room.ai_muted : false,
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (getRoom()) return NextResponse.json({ error: "already initialized" }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { aiName?: unknown; persona?: unknown };
  const aiName = typeof body.aiName === "string" ? body.aiName.trim() : "";
  const persona = typeof body.persona === "string" ? body.persona.trim() : "";
  if (!aiName) return NextResponse.json({ error: "aiName required" }, { status: 400 });
  if (!persona) return NextResponse.json({ error: "persona required" }, { status: 400 });
  if (aiName.length > 40) return NextResponse.json({ error: "aiName too long" }, { status: 400 });
  setupRoom(aiName, persona);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as { aiMuted?: unknown };
  if (typeof body.aiMuted !== "boolean") {
    return NextResponse.json({ error: "aiMuted boolean required" }, { status: 400 });
  }
  setMuted(body.aiMuted);
  publish("room", { aiMuted: body.aiMuted });
  return NextResponse.json({ ok: true });
}
