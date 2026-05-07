import { NextResponse } from "next/server";
import { clearIdentity } from "@/lib/identity";

export async function POST(): Promise<NextResponse> {
  await clearIdentity();
  return NextResponse.json({ ok: true });
}
