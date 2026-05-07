"use client";

import { useState } from "react";

export default function ClaimNameForm({ existing = [] }: { existing?: string[] }) {
  const useSelector = existing.length >= 2;
  const [name, setName] = useState(useSelector ? existing[0] : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: value }),
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
      {useSelector ? (
        <select
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        >
          {existing.map((n) => (
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
      <button type="submit" disabled={busy || !name.trim()} style={buttonStyle}>
        {busy ? "Entering…" : useSelector ? `Enter as ${name}` : "Enter"}
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
