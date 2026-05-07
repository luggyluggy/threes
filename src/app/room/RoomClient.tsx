"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
    } catch {
      // Network blip — next tick will retry.
    } finally {
      pollInFlightRef.current = false;
    }
  }, [merge]);

  // Polling loop.
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

  return (
    <div style={shellStyle}>
      <header style={headerStyle}>
        <div>
          <strong>Threes</strong>
          <span style={{ color: "#9aa0a6", marginLeft: 12 }}>
            you: {myName} · ai: {aiName}
          </span>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={aiMuted} onChange={toggleMute} />
          Mute {aiName}
        </label>
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
    </div>
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
