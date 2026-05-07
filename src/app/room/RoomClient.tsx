"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Channel = "ooc" | "ic";

interface Message {
  id: number;
  channel: Channel;
  sender: string;
  sender_kind: "human" | "ai";
  content: string;
  created_at: number;
}

interface PollResponse {
  ooc: Message[];
  ic: Message[];
  room: { initialized: boolean; aiName: string | null; aiMuted: boolean; aiTyping: boolean };
  personas: { ai: string | null; users: Record<string, string> };
}

const POLL_INTERVAL_MS = 1500;

export default function RoomClient({
  myName,
  aiName,
  initialMuted,
}: {
  myName: string;
  aiName: string;
  initialMuted: boolean;
}) {
  const [oocMessages, setOocMessages] = useState<Message[]>([]);
  const [icMessages, setIcMessages] = useState<Message[]>([]);
  const [aiMuted, setAiMuted] = useState(initialMuted);
  const [aiTyping, setAiTyping] = useState(false);
  const [aiPersona, setAiPersona] = useState<string>("");
  const [userPersonas, setUserPersonas] = useState<Record<string, string>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);

  const oocLastRef = useRef(0);
  const icLastRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollInFlightRef = useRef(false);

  const merge = useCallback((channel: Channel, incoming: Message[]) => {
    if (incoming.length === 0) return;
    if (channel === "ooc") {
      oocLastRef.current = Math.max(oocLastRef.current, incoming[incoming.length - 1].id);
      setOocMessages((prev) => mergeUnique(prev, incoming));
    } else {
      icLastRef.current = Math.max(icLastRef.current, incoming[incoming.length - 1].id);
      setIcMessages((prev) => mergeUnique(prev, incoming));
    }
  }, []);

  const poll = useCallback(async () => {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const res = await fetch(
        `/api/poll?oocSince=${oocLastRef.current}&icSince=${icLastRef.current}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as PollResponse;
      merge("ooc", data.ooc);
      merge("ic", data.ic);
      setAiMuted(data.room.aiMuted);
      setAiTyping(data.room.aiTyping);
      setAiPersona(data.personas.ai ?? "");
      setUserPersonas(data.personas.users);
    } catch {
      // Network blip — next tick will retry.
    } finally {
      pollInFlightRef.current = false;
    }
  }, [merge]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      await poll();
      if (stopped) return;
      pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
    return () => {
      stopped = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [poll]);

  const triggerPollSoon = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollTimerRef.current = setTimeout(() => void poll(), 200);
  }, [poll]);

  async function toggleMute() {
    const next = !aiMuted;
    setAiMuted(next);
    await fetch("/api/room", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiMuted: next }),
    });
    triggerPollSoon();
  }

  const otherUserName = useMemo(() => {
    const others = Object.keys(userPersonas).filter((n) => n !== myName);
    // Prefer someone who has actually spoken so we don't show stale ghost names.
    const speakersInOoc = new Set(
      oocMessages.filter((m) => m.sender_kind === "human").map((m) => m.sender),
    );
    const speakersInIc = new Set(
      icMessages.filter((m) => m.sender_kind === "human").map((m) => m.sender),
    );
    const allSpeakers = new Set<string>([...speakersInOoc, ...speakersInIc]);
    allSpeakers.delete(myName);
    if (allSpeakers.size > 0) return Array.from(allSpeakers).sort()[0];
    return others.sort()[0] ?? null;
  }, [userPersonas, oocMessages, icMessages, myName]);

  return (
    <div style={shellStyle}>
      <header style={headerStyle}>
        <div>
          <strong>Threes</strong>
          <span style={{ color: "#9aa0a6", marginLeft: 12 }}>
            you: {myName} · ai: {aiName}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => setDrawerOpen(true)} style={ghostButtonStyle}>
            Personas
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={aiMuted} onChange={toggleMute} />
            Mute {aiName}
          </label>
        </div>
      </header>
      <div style={panesStyle}>
        <Pane
          title="Out of character"
          subtitle="Just the two of you. The AI does not see this."
          channel="ooc"
          messages={oocMessages}
          myName={myName}
          aiName={aiName}
          onSent={triggerPollSoon}
        />
        <Pane
          title="In character"
          subtitle={
            aiMuted
              ? `${aiName} is muted and will not respond.`
              : `${aiName} replies after each message.`
          }
          channel="ic"
          messages={icMessages}
          myName={myName}
          aiName={aiName}
          typing={aiTyping && !aiMuted}
          onSent={triggerPollSoon}
        />
      </div>
      {drawerOpen && (
        <PersonasDrawer
          myName={myName}
          aiName={aiName}
          otherName={otherUserName}
          ownPersona={userPersonas[myName] ?? ""}
          otherPersona={otherUserName ? userPersonas[otherUserName] ?? "" : ""}
          aiPersona={aiPersona}
          onClose={() => setDrawerOpen(false)}
          onSaved={triggerPollSoon}
        />
      )}
    </div>
  );
}

function PersonasDrawer({
  myName,
  aiName,
  otherName,
  ownPersona,
  otherPersona,
  aiPersona,
  onClose,
  onSaved,
}: {
  myName: string;
  aiName: string;
  otherName: string | null;
  ownPersona: string;
  otherPersona: string;
  aiPersona: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <>
      <div style={overlayStyle} onClick={onClose} />
      <aside style={drawerStyle}>
        <div style={drawerHeaderStyle}>
          <div style={{ fontWeight: 600 }}>Personas</div>
          <button onClick={onClose} style={closeButtonStyle} aria-label="Close">
            ×
          </button>
        </div>
        <div style={drawerBodyStyle}>
          <PersonaEditor
            label={`Your character (${myName})`}
            hint="Visible to the other human and to the AI. Only you can edit this."
            initial={ownPersona}
            endpoint="/api/me"
            onSaved={onSaved}
          />
          <PersonaEditor
            label={`AI (${aiName})`}
            hint="Either human can change this at any time. Affects the AI's behavior on the next reply."
            initial={aiPersona}
            endpoint="/api/room"
            payloadKey="persona"
            onSaved={onSaved}
            required
          />
          <ReadOnlyPersona
            label={otherName ? `Other character (${otherName})` : "Other character"}
            content={otherPersona}
            empty={
              otherName
                ? `${otherName} hasn't set a persona yet.`
                : "No other user has joined yet."
            }
          />
        </div>
      </aside>
    </>
  );
}

function PersonaEditor({
  label,
  hint,
  initial,
  endpoint,
  payloadKey = "persona",
  required = false,
  onSaved,
}: {
  label: string;
  hint: string;
  initial: string;
  endpoint: string;
  payloadKey?: string;
  required?: boolean;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [savedValue, setSavedValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // If the upstream value changes (someone else saved it, poll picked it up)
  // and we have no unsaved edits, sync.
  useEffect(() => {
    if (value === savedValue) {
      setValue(initial);
      setSavedValue(initial);
    } else {
      // Track the upstream value silently so we know what to compare against.
      setSavedValue(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const dirty = value !== savedValue;

  async function save() {
    if (saving) return;
    if (required && !value.trim()) {
      setErr("cannot be empty");
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [payloadKey]: value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "failed");
    } else {
      setSavedValue(value);
      onSaved();
    }
    setSaving(false);
  }

  return (
    <section style={editorSectionStyle}>
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ color: "#9aa0a6", fontSize: 12 }}>{hint}</div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        style={editorTextareaStyle}
        placeholder="Describe the character — appearance, voice, motivations, anything you want known."
      />
      {err && <div style={{ color: "#ff8a8a", fontSize: 13 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={save}
          disabled={saving || !dirty}
          style={dirty ? primaryButtonStyle : ghostButtonStyle}
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
        {dirty && (
          <button
            onClick={() => {
              setValue(savedValue);
              setErr(null);
            }}
            disabled={saving}
            style={ghostButtonStyle}
          >
            Discard
          </button>
        )}
      </div>
    </section>
  );
}

function ReadOnlyPersona({
  label,
  content,
  empty,
}: {
  label: string;
  content: string;
  empty: string;
}) {
  return (
    <section style={editorSectionStyle}>
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ color: "#9aa0a6", fontSize: 12 }}>Read-only. Only that user can edit it.</div>
      <div
        style={{
          ...editorTextareaStyle,
          background: "#0a0b0e",
          color: content ? "#e8e8ea" : "#6f7480",
          fontStyle: content ? "normal" : "italic",
          minHeight: 96,
          whiteSpace: "pre-wrap",
        }}
      >
        {content || empty}
      </div>
    </section>
  );
}

function mergeUnique(prev: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map((m) => m.id));
  const additions = incoming.filter((m) => !seen.has(m.id));
  if (additions.length === 0) return prev;
  return [...prev, ...additions].sort((a, b) => a.id - b.id);
}

function Pane({
  title,
  subtitle,
  channel,
  messages,
  myName,
  aiName,
  typing,
  onSent,
}: {
  title: string;
  subtitle: string;
  channel: Channel;
  messages: Message[];
  myName: string;
  aiName: string;
  typing?: boolean;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft("");
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, content }),
    });
    if (!res.ok) {
      setDraft(content);
    } else {
      onSent();
    }
    setSending(false);
  }

  return (
    <section style={paneStyle}>
      <div style={paneHeaderStyle}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ color: "#9aa0a6", fontSize: 12 }}>{subtitle}</div>
      </div>
      <div ref={scrollRef} style={paneBodyStyle}>
        {messages.map((m) => (
          <MessageRow key={m.id} m={m} myName={myName} aiName={aiName} />
        ))}
        {typing && (
          <div style={{ color: "#9aa0a6", fontStyle: "italic", padding: "4px 0" }}>
            {aiName} is typing…
          </div>
        )}
      </div>
      <form onSubmit={send} style={paneFormStyle}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e);
            }
          }}
          placeholder={`Message in ${title.toLowerCase()}…`}
          rows={2}
          style={textareaStyle}
        />
        <button type="submit" disabled={sending || !draft.trim()} style={sendButtonStyle}>
          Send
        </button>
      </form>
    </section>
  );
}

function MessageRow({ m, myName, aiName }: { m: Message; myName: string; aiName: string }) {
  const isMe = m.sender === myName && m.sender_kind === "human";
  const isAI = m.sender_kind === "ai";
  const color = isAI ? "#c79bff" : isMe ? "#8ab4ff" : "#7ed7a3";
  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ color, fontSize: 12, fontWeight: 600 }}>
        {isAI ? aiName : m.sender}
      </div>
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{m.content}</div>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 18px",
  borderBottom: "1px solid #23262d",
  background: "#15171c",
};

const panesStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 1,
  background: "#23262d",
  flex: 1,
  minHeight: 0,
};

const paneStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "#0e0f12",
  minHeight: 0,
};

const paneHeaderStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderBottom: "1px solid #23262d",
  background: "#13151a",
};

const paneBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 16px",
  minHeight: 0,
};

const paneFormStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: 12,
  borderTop: "1px solid #23262d",
  background: "#13151a",
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 10px",
  background: "#0e0f12",
  border: "1px solid #2a2d35",
  borderRadius: 8,
  outline: "none",
  resize: "none",
  fontFamily: "inherit",
};

const sendButtonStyle: React.CSSProperties = {
  padding: "0 16px",
  background: "#3457d5",
  color: "white",
  border: "none",
  borderRadius: 8,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  zIndex: 10,
};

const drawerStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  height: "100vh",
  width: "min(440px, 100vw)",
  background: "#13151a",
  borderLeft: "1px solid #23262d",
  zIndex: 11,
  display: "flex",
  flexDirection: "column",
};

const drawerHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 18px",
  borderBottom: "1px solid #23262d",
};

const drawerBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 18,
  display: "flex",
  flexDirection: "column",
  gap: 24,
};

const editorSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const editorTextareaStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: "#0e0f12",
  border: "1px solid #2a2d35",
  borderRadius: 8,
  outline: "none",
  resize: "vertical",
  fontFamily: "inherit",
  color: "inherit",
  minHeight: 120,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "#3457d5",
  color: "white",
  border: "none",
  borderRadius: 8,
};

const ghostButtonStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "transparent",
  color: "#c9ccd3",
  border: "1px solid #2a2d35",
  borderRadius: 8,
};

const closeButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: "#c9ccd3",
  border: "none",
  fontSize: 22,
  lineHeight: 1,
  padding: "0 8px",
};
