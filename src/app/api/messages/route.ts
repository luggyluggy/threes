import { NextResponse } from "next/server";
import { after } from "next/server";
import {
  getLastPunishmentScanId,
  getLatestIcMessageId,
  getMessages,
  getRoom,
  insertMessage,
  setLastPunishmentScanId,
  type Channel,
} from "@/lib/db";
import { getIdentity } from "@/lib/identity";
import { getPrison } from "@/lib/prisons";
import { runAILoop } from "@/lib/ai";
import { extractAndApplyMovements } from "@/lib/extract";
import { scanForPunishments } from "@/lib/punishments";

const PUNISHMENT_SCAN_INTERVAL = 5;

export const maxDuration = 60;

function parseChannel(value: string | null): Channel | null {
  return value === "ooc" || value === "ic" ? value : null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const identity = await getIdentity();
  if (!identity)
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const url = new URL(req.url);
  const channel = parseChannel(url.searchParams.get("channel"));
  if (!channel) return NextResponse.json({ error: "invalid channel" }, { status: 400 });
  const sinceId = Number(url.searchParams.get("sinceId") || 0) || 0;
  const messages = await getMessages(identity.prisonId, channel, sinceId);
  return NextResponse.json({ messages });
}

export async function POST(req: Request): Promise<NextResponse> {
  const identity = await getIdentity();
  if (!identity)
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const prison = getPrison(identity.prisonId);
  if (!prison) return NextResponse.json({ error: "unknown prison" }, { status: 400 });

  const room = await getRoom(prison.id);
  if (!room) return NextResponse.json({ error: "room not initialized" }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as {
    channel?: unknown;
    content?: unknown;
  };
  const channel = parseChannel(typeof body.channel === "string" ? body.channel : null);
  if (!channel) return NextResponse.json({ error: "invalid channel" }, { status: 400 });
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });
  if (content.length > 4000)
    return NextResponse.json({ error: "content too long" }, { status: 400 });

  const msg = await insertMessage(prison.id, channel, identity.name, "human", content);

  if (channel === "ic") {
    after(async () => {
      try {
        await extractAndApplyMovements(prison.id);
      } catch (err) {
        console.error("extraction error:", err);
      }
      if (!room.ai_muted) {
        try {
          await runAILoop(prison.id);
        } catch (err) {
          console.error("AI loop error:", err);
        }
      }
      try {
        const [latestId, lastScanId] = await Promise.all([
          getLatestIcMessageId(prison.id),
          getLastPunishmentScanId(prison.id),
        ]);
        if (latestId - lastScanId >= PUNISHMENT_SCAN_INTERVAL) {
          await setLastPunishmentScanId(prison.id, latestId);
          await scanForPunishments(prison.id);
        }
      } catch (err) {
        console.error("punishment scan error:", err);
      }
    });
  }

  return NextResponse.json({ message: msg });
}
