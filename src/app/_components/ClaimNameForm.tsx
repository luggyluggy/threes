"use client";

import { useState } from "react";

export default function ClaimNameForm({
  prisonId,
  prisonName,
  characters,
}: {
  prisonId: string;
  prisonName: string;
  characters: string[];
}) {
  const useSelector = characters.length >= 2;
  const [name, setName] = useState(useSelector ? characters[0] : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prisonId, name: value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "failed");
      setBusy(false);
      return;
    }
    window.location.href = "/";
  }

  async function changePrison() {
    setBusy(true);
    await fetch("/api/leave", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ color: "#9aa0a6", fontSize: 13 }}>
        Entering as a character of <strong>{prisonName}</strong>.
      </div>
      {useSelector ? (
        <select
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        >
          {characters.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      ) : (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="your name"
          maxLength={40}
          style={inputStyle}
        />
      )}
      {err && <div style={{ color: "#ff8a8a" }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={busy || !name.trim()} style={primaryButtonStyle}>
          {busy ? "Entering…" : useSelector ? `Enter as ${name}` : "Enter"}
        </button>
        <button
          type="button"
          onClick={changePrison}
          disabled={busy}
          style={ghostButtonStyle}
        >
          Change prison
        </button>
      </div>
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

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  background: "#3457d5",
  color: "white",
  border: "none",
  borderRadius: 8,
};

const ghostButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  background: "transparent",
  color: "#c9ccd3",
  border: "1px solid #2a2d35",
  borderRadius: 8,
};
