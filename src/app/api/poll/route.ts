import { NextResponse, after } from "next/server";
import {
  getAllUserPersonas,
  claimDueTasks,
  clearStaleTyping,
  getMessages,
  getPositions,
  getPunishments,
  getRoom,
} from "@/lib/db";
import { runAILoop } from "@/lib/ai";
import { getIdentity } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const identity = await getIdentity();
  if (!identity)
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const roomId = identity.prisonId;

  const url = new URL(req.url);
  const oocSince = Number(url.searchParams.get("oocSince") || 0) || 0;
  const icSince = Number(url.searchParams.get("icSince") || 0) || 0;

  await clearStaleTyping(roomId);

  const [room, ooc, ic, userPersonas, positions, punishments] = await Promise.all([
    getRoom(roomId),
    getMessages(roomId, "ooc", oocSince),
    getMessages(roomId, "ic", icSince),
    getAllUserPersonas(roomId),
    getPositions(roomId),
    getPunishments(roomId, 100),
  ]);

  const users: Record<string, string> = {};
  for (const p of userPersonas) users[p.name] = p.persona;

  const positionsMap: Record<string, string> = {};
  for (const p of positions) positionsMap[p.character_name] = p.location_room_id;

  after(async () => {
    try {
      const tasks = await claimDueTasks(roomId);
      for (const task of tasks) {
        try {
          await runAILoop(roomId, { triggerNote: task.trigger_note });
        } catch (err) {
          console.error("scheduled task failed:", task.id, err);
        }
      }
    } catch (err) {
      console.error("claimDueTasks failed:", err);
    }
  });

  return NextResponse.json({
    ooc,
    ic,
    room: {
      initialized: !!room,
      aiName: room?.ai_name ?? null,
      aiMuted: room?.ai_muted ?? false,
      aiTyping: room?.ai_typing ?? false,
    },
    personas: {
      ai: room?.persona ?? null,
      users,
    },
    positions: positionsMap,
    punishments,
  });
}
