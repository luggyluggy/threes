import { NextResponse } from "next/server";
import { CHARACTER_NAMES } from "@/lib/characters";
import { setName } from "@/lib/identity";

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!CHARACTER_NAMES.includes(name)) {
    return NextResponse.json({ error: "unknown character" }, { status: 400 });
  }
  await setName(name);
  return NextResponse.json({ ok: true, name });
}
