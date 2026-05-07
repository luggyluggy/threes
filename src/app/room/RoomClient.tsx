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

  const append = useCallback((m: Message) => {
    const setter = m.channel === "ooc" ? setOocMessages : setIcMessages;
    setter((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  // Initial history load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [oocRes, icRes] = await Promise.all([
        fetch("/api/messages?channel=ooc").then((r) => r.json()),
        fetch("/api/messages?channel=ic").then((r) => r.json()),
      ]);
      if (cancelled) return;
      setOocMessages(oocRes.messages || []);
      setIcMessages(icRes.messages || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // SSE subscription.
  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.addEventListener("message", (e) => {
      const m = JSON.parse((e as MessageEvent).data) as Message;
      append(m);
    });
    es.addEventListener("room", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        aiMuted?: boolean;
        typing?: boolean;
      };
      if (typeof data.aiMuted === "boolean") setAiMuted(data.aiMuted);
      if (typeof data.typing === "boolean") setAiTyping(data.typing);
    });
    es.onerror = () => {
      // Browser will auto-reconnect; nothing to do.
    };
    return () => es.close();
  }, [append]);

  async function toggleMute() {
    const next = !aiMuted;
    setAiMuted(next);
    await fetch("/api/room", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiMuted: next }),
    });
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
        />
      </div>
    </div>
  );
}

function Pane({
  title,
  subtitle,
  channel,
  messages,
  myName,
  aiName,
  typing,
}: {
  title: string;
  subtitle: string;
  channel: Channel;
  messages: Message[];
  myName: string;
  aiName: string;
  typing?: boolean;
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
      // Restore draft so the user can retry.
      setDraft(content);
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
