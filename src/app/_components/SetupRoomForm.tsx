"use client";

import { useState } from "react";

export default function SetupRoomForm() {
  const [aiName, setAiName] = useState("");
  const [persona, setPersona] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!aiName.trim() || !persona.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiName: aiName.trim(), persona: persona.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "failed");
      setBusy(false);
      return;
    }
    window.location.href = "/room";
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={labelStyle}>
        AI name
        <input
          value={aiName}
          onChange={(e) => setAiName(e.target.value)}
          placeholder="e.g. Vex"
          maxLength={40}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        Persona / scene description
        <textarea
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="Describe who the AI is, the setting, tone, anything you want it to know."
          rows={8}
          style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
        />
      </label>
      {err && <div style={{ color: "#ff8a8a" }}>{err}</div>}
      <button type="submit" disabled={busy || !aiName.trim() || !persona.trim()} style={buttonStyle}>
        {busy ? "Creating…" : "Create room"}
      </button>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  color: "#c9ccd3",
  fontSize: 14,
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: "#0e0f12",
  border: "1px solid #2a2d35",
  borderRadius: 8,
  outline: "none",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  background: "#3457d5",
  color: "white",
  border: "none",
  borderRadius: 8,
};
