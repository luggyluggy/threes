export type RoomKind =
  | "admin"
  | "interrogation"
  | "cell"
  | "hallway"
  | "showers"
  | "dining"
  | "yard";

export interface RoomDef {
  id: string;
  label: string;
  description: string;
  kind: RoomKind;
  x: number;
  y: number;
  w: number;
  h: number;
  highlighted?: boolean;
}

// Portrait floor plan. Rooms share walls (no gaps) so the SVG reads as a
// connected building rather than a table of cards. ViewBox is 200 × 540.
export const VIEW_W = 200;
export const VIEW_H = 540;

export const ROOMS: readonly RoomDef[] = [
  // Admin band at the top.
  {
    id: "warden",
    label: "Warden's Office",
    description: "The warden's office",
    kind: "admin",
    x: 0,
    y: 0,
    w: 200,
    h: 48,
  },

  // Interrogation row.
  {
    id: "interrogation_a",
    label: "Interrog. A",
    description: "Interrogation room",
    kind: "interrogation",
    x: 0,
    y: 48,
    w: 100,
    h: 56,
  },
  {
    id: "interrogation_b",
    label: "Interrog. B",
    description: "Interrogation room",
    kind: "interrogation",
    x: 100,
    y: 48,
    w: 100,
    h: 56,
  },

  // Cell block: four cells flanking a central corridor.
  {
    id: "cell_414",
    label: "Cell 414",
    description: "Jail cell",
    kind: "cell",
    x: 0,
    y: 104,
    w: 70,
    h: 64,
  },
  {
    id: "cell_415",
    label: "Cell 415",
    description: "Jail cell",
    kind: "cell",
    x: 130,
    y: 104,
    w: 70,
    h: 64,
  },
  {
    id: "hallway",
    label: "Hallway",
    description: "Main corridor running through the cell block",
    kind: "hallway",
    x: 70,
    y: 104,
    w: 60,
    h: 128,
  },
  {
    id: "cell_416",
    label: "Cell 416",
    description: "Jail cell — the prisoner's cell",
    kind: "cell",
    x: 0,
    y: 168,
    w: 70,
    h: 64,
    highlighted: true,
  },
  {
    id: "cell_417",
    label: "Cell 417",
    description: "Jail cell",
    kind: "cell",
    x: 130,
    y: 168,
    w: 70,
    h: 64,
  },

  // Common areas.
  {
    id: "showers",
    label: "Showers",
    description: "Communal showers",
    kind: "showers",
    x: 0,
    y: 232,
    w: 200,
    h: 60,
  },
  {
    id: "dining",
    label: "Dining Hall",
    description: "Cafeteria / dining hall",
    kind: "dining",
    x: 0,
    y: 292,
    w: 200,
    h: 88,
  },

  // Yard at the bottom — outdoors.
  {
    id: "yard",
    label: "Outdoor Yard",
    description: "Outdoor exercise yard",
    kind: "yard",
    x: 0,
    y: 380,
    w: 200,
    h: 160,
  },
] as const;

export const ROOM_IDS: ReadonlySet<string> = new Set(ROOMS.map((r) => r.id));

export function getRoomDef(id: string): RoomDef | null {
  return ROOMS.find((r) => r.id === id) ?? null;
}

export function roomLabel(id: string): string {
  return getRoomDef(id)?.label ?? id;
}
