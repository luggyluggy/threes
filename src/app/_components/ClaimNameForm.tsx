"use client";

import { useState } from "react";

export default function ClaimNameForm() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
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
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="your name"
        maxLength={40}
        style={inputStyle}
      />
      {err && <div style={{ color: "#ff8a8a" }}>{err}</div>}
      <button type="submit" disabled={busy || !name.trim()} style={buttonStyle}>
        {busy ? "Entering…" : "Enter"}
      </button>
    </form>
  );
}

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
