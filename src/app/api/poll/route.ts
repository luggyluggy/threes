import { NextResponse, after } from "next/server";
import { getAllUserPersonas, claimDueTasks, getMessages, getPositions, getRoom } from "@/lib/db";
import { runAILoop } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const oocSince = Number(url.searchParams.get("oocSince") || 0) || 0;
  const icSince = Number(url.searchParams.get("icSince") || 0) || 0;

  const [room, ooc, ic, userPersonas, positions] = await Promise.all([
    getRoom(),
    getMessages("ooc", oocSince),
    getMessages("ic", icSince),
    getAllUserPersonas(),
    getPositions(),
  ]);

  const users: Record<string, string> = {};
  for (const p of userPersonas) users[p.name] = p.persona;

  const positionsMap: Record<string, string> = {};
  for (const p of positions) positionsMap[p.character_name] = p.room_id;

  after(async () => {
    try {
      const tasks = await claimDueTasks();
      for (const task of tasks) {
        try {
          await runAILoop({ triggerNote: task.trigger_note });
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
  });
}
