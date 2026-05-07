import { redirect } from "next/navigation";
import { getRoom } from "@/lib/db";
import { CHARACTER_NAMES } from "@/lib/characters";
import { getName } from "@/lib/identity";
import ClaimNameForm from "./_components/ClaimNameForm";
import SetupRoomForm from "./_components/SetupRoomForm";

export default async function Home() {
  const name = await getName();
  if (!name) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0 }}>Threes</h1>
          <p style={{ color: "#9aa0a6" }}>Choose your character.</p>
          <ClaimNameForm existing={[...CHARACTER_NAMES]} />
        </div>
      </main>
    );
  }

  const room = await getRoom();
  if (!room) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0 }}>Set up the room</h1>
          <p style={{ color: "#9aa0a6" }}>
            Hi <strong>{name}</strong>. The room hasn&apos;t been initialized yet. Set the AI&apos;s
            name and persona — these are fixed for the lifetime of the room.
          </p>
          <SetupRoomForm />
        </div>
      </main>
    );
  }

  redirect("/room");
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 24,
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  padding: 28,
  background: "#15171c",
  border: "1px solid #23262d",
  borderRadius: 12,
};
