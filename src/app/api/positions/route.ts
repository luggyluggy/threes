import { NextResponse } from "next/server";
import { getPositions, setPosition } from "@/lib/db";
import { getName } from "@/lib/identity";
import { ROOM_IDS } from "@/lib/rooms";

export async function GET(): Promise<NextResponse> {
  const positions = await getPositions();
  return NextResponse.json({ positions });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const name = await getName();
  if (!name) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    character?: unknown;
    room?: unknown;
  };
  const character = typeof body.character === "string" ? body.character.trim() : "";
  const room = typeof body.room === "string" ? body.room.trim() : "";
  if (!character) return NextResponse.json({ error: "character required" }, { status: 400 });
  if (!ROOM_IDS.has(room))
    return NextResponse.json({ error: "unknown room" }, { status: 400 });

  await setPosition(character, room);
  return NextResponse.json({ ok: true });
}
