import { NextResponse } from "next/server";
import { setPrisonId } from "@/lib/identity";
import { getPrison } from "@/lib/prisons";

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as { prisonId?: unknown };
  const prisonId = typeof body.prisonId === "string" ? body.prisonId : "";
  const prison = getPrison(prisonId);
  if (!prison) {
    return NextResponse.json({ error: "unknown prison" }, { status: 400 });
  }
  await setPrisonId(prison.id);
  return NextResponse.json({ ok: true, prisonId: prison.id });
}
