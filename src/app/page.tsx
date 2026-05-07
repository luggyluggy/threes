import { redirect } from "next/navigation";
import { getRoom, setupRoom } from "@/lib/db";
import { getIdentity, getPrisonId } from "@/lib/identity";
import { getPrison, PRISON_ORDER } from "@/lib/prisons";
import ClaimNameForm from "./_components/ClaimNameForm";
import PrisonPickerForm from "./_components/PrisonPickerForm";

export default async function Home() {
  const identity = await getIdentity();
  if (identity) {
    const prison = getPrison(identity.prisonId);
    if (prison && prison.humans.includes(identity.name)) {
      // Both halves of identity are valid — make sure the room exists, then go.
      const room = await getRoom(prison.id);
      if (!room) await setupRoom(prison.id, prison.aiName, prison.aiPersona);
      redirect("/room");
    }
  }

  const prisonId = await getPrisonId();
  const prison = getPrison(prisonId);

  if (!prison) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0 }}>Threes</h1>
          <p style={{ color: "#9aa0a6" }}>Pick a prison to enter.</p>
          <PrisonPickerForm
            prisons={PRISON_ORDER.map((p) => ({
              id: p.id,
              displayName: p.displayName,
              blurb: blurbFor(p.id),
            }))}
          />
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ marginTop: 0 }}>{prison.displayName}</h1>
        <p style={{ color: "#9aa0a6" }}>Choose your character.</p>
        <ClaimNameForm
          prisonId={prison.id}
          prisonName={prison.displayName}
          characters={[...prison.humans]}
        />
      </div>
    </main>
  );
}

function blurbFor(id: string): string {
  switch (id) {
    case "hardgrove":
      return "Women's correctional facility. AI plays the cell-block guard.";
    case "monty":
      return "Co-ed correctional facility. AI plays the floor officer.";
    default:
      return "";
  }
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
