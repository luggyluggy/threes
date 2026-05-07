"use client";

import { useMemo, useState } from "react";
import { ROOM_IDS, ROOMS, VIEW_H, VIEW_W, type RoomDef } from "@/lib/rooms";

interface Character {
  name: string;
  kind: "human" | "ai";
  isMe: boolean;
}

interface Props {
  characters: Character[];
  positions: Record<string, string>;
  onMove: (character: string, roomId: string) => void;
}

export default function PrisonMap({ characters, positions, onMove }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const tokensByRoom = useMemo(() => {
    const m = new Map<string, Character[]>();
    for (const c of characters) {
      const room = positions[c.name];
      if (!room || !ROOM_IDS.has(room)) continue;
      const list = m.get(room) ?? [];
      list.push(c);
      m.set(room, list);
    }
    return m;
  }, [characters, positions]);

  const offMap = characters.filter((c) => {
    const room = positions[c.name];
    return !room || !ROOM_IDS.has(room);
  });

  function handleRoomClick(roomId: string) {
    if (!selected) return;
    onMove(selected, roomId);
    setSelected(null);
  }

  function handleTokenClick(name: string) {
    setSelected((prev) => (prev === name ? null : name));
  }

  return (
    <div style={containerStyle}>
      <div style={hintStyle}>
        {selected
          ? `Click a room to place ${selected}, or click them again to cancel.`
          : "Locations update from the in-character chat. Click a token to override."}
      </div>
      <div style={mapWrapStyle}>
        <svg
          viewBox={`-3 -3 ${VIEW_W + 6} ${VIEW_H + 6}`}
          preserveAspectRatio="xMidYMin meet"
          style={{ width: "100%", height: "auto", display: "block" }}
          onClick={() => setSelected(null)}
        >
          {/* Outer perimeter wall */}
          <rect
            x={-1}
            y={-1}
            width={VIEW_W + 2}
            height={VIEW_H + 2}
            fill="#0a0b0e"
            stroke="#3d424d"
            strokeWidth={2}
          />
          {ROOMS.map((r) => (
            <RoomRect
              key={r.id}
              room={r}
              tokens={tokensByRoom.get(r.id) ?? []}
              clickable={!!selected}
              selectedName={selected}
              onClick={() => handleRoomClick(r.id)}
              onTokenClick={handleTokenClick}
            />
          ))}
          {/* Re-stroke the perimeter on top so it sits above inner walls */}
          <rect
            x={0}
            y={0}
            width={VIEW_W}
            height={VIEW_H}
            fill="none"
            stroke="#525866"
            strokeWidth={2.5}
            pointerEvents="none"
          />
        </svg>
      </div>
      {offMap.length > 0 && (
        <div style={offMapStyle}>
          <div style={{ color: "#9aa0a6", fontSize: 12, marginBottom: 4 }}>
            Off-map (location not yet established):
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {offMap.map((c) => (
              <button
                key={c.name}
                onClick={() => handleTokenClick(c.name)}
                style={{
                  ...offMapTokenStyle,
                  borderColor: tokenColor(c) + "88",
                  outline: selected === c.name ? `2px solid ${tokenColor(c)}` : undefined,
                }}
              >
                <span
                  style={{
                    ...miniTokenStyle,
                    background: tokenColor(c),
                  }}
                >
                  {initials(c.name)}
                </span>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RoomRect({
  room,
  tokens,
  clickable,
  selectedName,
  onClick,
  onTokenClick,
}: {
  room: RoomDef;
  tokens: Character[];
  clickable: boolean;
  selectedName: string | null;
  onClick: () => void;
  onTokenClick: (name: string) => void;
}) {
  const palette = roomPalette(room);
  const stroke = clickable ? "#3457d5" : "#3d424d";

  return (
    <g
      onClick={(e) => {
        if (clickable) {
          e.stopPropagation();
          onClick();
        }
      }}
      style={{ cursor: clickable ? "pointer" : "default" }}
    >
      <rect
        x={room.x}
        y={room.y}
        width={room.w}
        height={room.h}
        fill={palette.fill}
        stroke={stroke}
        strokeWidth={1}
      />
      {/* Yard gets a subtle hatch to read as outdoor */}
      {room.kind === "yard" && (
        <YardHatch x={room.x} y={room.y} w={room.w} h={room.h} />
      )}
      <text
        x={room.x + 6}
        y={room.y + 12}
        fill={palette.label}
        fontSize={9}
        fontWeight={600}
        style={{ pointerEvents: "none", userSelect: "none", letterSpacing: 0.3 }}
      >
        {room.label.toUpperCase()}
      </text>
      {tokens.map((c, i) => {
        const cols = Math.max(1, Math.floor((room.w - 14) / 22));
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = room.x + 14 + col * 22;
        const cy = room.y + room.h - 14 - row * 22;
        const r = 8;
        const isSelected = selectedName === c.name;
        return (
          <g
            key={c.name}
            onClick={(e) => {
              e.stopPropagation();
              onTokenClick(c.name);
            }}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={cx}
              cy={cy}
              r={r + (isSelected ? 2 : 0)}
              fill={tokenColor(c)}
              stroke={isSelected ? "#ffffff" : "#0e0f12"}
              strokeWidth={isSelected ? 2 : 1}
            />
            <text
              x={cx}
              y={cy + 3}
              fill="#0e0f12"
              fontSize={9}
              fontWeight={700}
              textAnchor="middle"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {initials(c.name)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function YardHatch({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const lines: React.ReactNode[] = [];
  const spacing = 12;
  // Diagonal lines clipped to the yard rect.
  const id = `yard-clip-${x}-${y}`;
  for (let off = -h; off < w + h; off += spacing) {
    lines.push(
      <line
        key={off}
        x1={x + off}
        y1={y}
        x2={x + off + h}
        y2={y + h}
        stroke="#1a3a1f"
        strokeWidth={0.5}
        opacity={0.6}
      />,
    );
  }
  return (
    <g clipPath={`url(#${id})`}>
      <defs>
        <clipPath id={id}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>
      {lines}
    </g>
  );
}

function roomPalette(room: RoomDef): { fill: string; label: string } {
  if (room.highlighted) return { fill: "#251635", label: "#d3b8ff" };
  switch (room.kind) {
    case "admin":
      return { fill: "#1d1a16", label: "#c0a98a" };
    case "interrogation":
      return { fill: "#1d1416", label: "#e6a8a8" };
    case "cell":
      return { fill: "#131519", label: "#8c92a0" };
    case "hallway":
      return { fill: "#1c1f25", label: "#7d8390" };
    case "showers":
      return { fill: "#13191c", label: "#8eb2bc" };
    case "dining":
      return { fill: "#1e1a14", label: "#d4b48a" };
    case "yard":
      return { fill: "#142016", label: "#9ec7a3" };
  }
}

function tokenColor(c: Character): string {
  if (c.kind === "ai") return "#c79bff";
  if (c.isMe) return "#8ab4ff";
  return "#7ed7a3";
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "#0e0f12",
  minHeight: 0,
};

const hintStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 12,
  color: "#9aa0a6",
  borderBottom: "1px solid #23262d",
  background: "#13151a",
  flex: "0 0 auto",
};

const mapWrapStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: "8px 12px 12px",
};

const offMapStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderTop: "1px solid #23262d",
  background: "#13151a",
  flex: "0 0 auto",
};

const offMapTokenStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  fontSize: 12,
  color: "#e8e8ea",
  background: "#0e0f12",
  border: "1px solid",
  borderRadius: 999,
  cursor: "pointer",
};

const miniTokenStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  height: 18,
  borderRadius: "50%",
  fontSize: 9,
  fontWeight: 700,
  color: "#0e0f12",
};
