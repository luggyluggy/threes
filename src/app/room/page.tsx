import { redirect } from "next/navigation";
import { getRoom, setupRoom } from "@/lib/db";
import { getIdentity } from "@/lib/identity";
import { getPrison } from "@/lib/prisons";
import RoomClient from "./RoomClient";

export const dynamic = "force-dynamic";

export default async function RoomPage() {
  const identity = await getIdentity();
  if (!identity) redirect("/");
  const prison = getPrison(identity.prisonId);
  if (!prison || !prison.humans.includes(identity.name)) redirect("/");

  let room = await getRoom(prison.id);
  if (!room) room = await setupRoom(prison.id, prison.aiName, prison.aiPersona);

  return (
    <RoomClient
      myName={identity.name}
      aiName={room.ai_name!}
      initialMuted={room.ai_muted}
      prisonName={prison.displayName}
      inmates={prison.inmates.map((i) => ({ ...i }))}
    />
  );
}
