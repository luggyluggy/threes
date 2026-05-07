import { redirect } from "next/navigation";
import { getRoom, setupRoom } from "@/lib/db";
import { AI_NAME, AI_PERSONA, CHARACTER_NAMES } from "@/lib/characters";
import { getName } from "@/lib/identity";
import ClaimNameForm from "./_components/ClaimNameForm";

export default async function Home() {
  const name = await getName();
  if (!name || !CHARACTER_NAMES.includes(name)) {
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
    await setupRoom(AI_NAME, AI_PERSONA);
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
