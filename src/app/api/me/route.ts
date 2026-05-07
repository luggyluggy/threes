import { NextResponse } from "next/server";
import { getUserPersona, setUserPersona } from "@/lib/db";
import { getName } from "@/lib/identity";

export async function GET(): Promise<NextResponse> {
  const name = await getName();
  if (!name) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const p = await getUserPersona(name);
  return NextResponse.json({ name, persona: p?.persona ?? "" });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const name = await getName();
  if (!name) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { persona?: unknown };
  if (typeof body.persona !== "string")
    return NextResponse.json({ error: "persona string required" }, { status: 400 });
  if (body.persona.length > 4000)
    return NextResponse.json({ error: "persona too long" }, { status: 400 });
  await setUserPersona(name, body.persona.trim());
  return NextResponse.json({ ok: true });
}
