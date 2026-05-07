import { NextResponse } from "next/server";
import { getPrison } from "@/lib/prisons";
import { setName, setPrisonId } from "@/lib/identity";

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as {
    prisonId?: unknown;
    name?: unknown;
  };
  const prisonId = typeof body.prisonId === "string" ? body.prisonId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  const prison = getPrison(prisonId);
  if (!prison) {
    return NextResponse.json({ error: "unknown prison" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!prison.humans.includes(name)) {
    return NextResponse.json({ error: "unknown character" }, { status: 400 });
  }

  await setPrisonId(prison.id);
  await setName(name);
  return NextResponse.json({ ok: true, prisonId: prison.id, name });
}
