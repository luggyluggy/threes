"use client";

import { useState } from "react";

interface Option {
  id: string;
  displayName: string;
  blurb: string;
}

export default function PrisonPickerForm({ prisons }: { prisons: Option[] }) {
  const [selected, setSelected] = useState(prisons[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/prison", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prisonId: selected }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "failed");
      setBusy(false);
      return;
    }
    window.location.href = "/";
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {prisons.map((p) => (
          <label
            key={p.id}
            style={{
              ...optionStyle,
              borderColor: selected === p.id ? "#3457d5" : "#2a2d35",
              background: selected === p.id ? "#15192a" : "#0e0f12",
            }}
          >
            <input
              type="radio"
              name="prison"
              value={p.id}
              checked={selected === p.id}
              onChange={() => setSelected(p.id)}
              style={{ marginTop: 3 }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontWeight: 600 }}>{p.displayName}</div>
              <div style={{ color: "#9aa0a6", fontSize: 13 }}>{p.blurb}</div>
            </div>
          </label>
        ))}
      </div>
      {err && <div style={{ color: "#ff8a8a" }}>{err}</div>}
      <button type="submit" disabled={busy || !selected} style={buttonStyle}>
        {busy ? "Entering…" : "Continue"}
      </button>
    </form>
  );
}

const optionStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "12px 14px",
  border: "1px solid",
  borderRadius: 10,
  cursor: "pointer",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  background: "#3457d5",
  color: "white",
  border: "none",
  borderRadius: 8,
};
