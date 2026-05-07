import { redirect } from "next/navigation";
import { getRoom } from "@/lib/db";
import { getName } from "@/lib/identity";
import RoomClient from "./RoomClient";

export const dynamic = "force-dynamic";

export default async function RoomPage() {
  const name = await getName();
  if (!name) redirect("/");
  const room = getRoom();
  if (!room) redirect("/");
  return (
    <RoomClient
      myName={name}
      aiName={room.ai_name!}
      initialMuted={!!room.ai_muted}
    />
  );
}
