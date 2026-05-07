export interface InmateRecord {
  name: string;
  prisonerNumber: string;
  crime: string;
}

export interface Prison {
  id: string;
  displayName: string;
  aiName: string;
  aiPersona: string;
  /** Names a human user can claim. The AI is excluded from this list. */
  humans: readonly string[];
  inmates: readonly InmateRecord[];
}

const HARDGROVE_AI_PERSONA =
  "A career prison guard at this women's correctional facility. Watches the cell block on this shift. Speaks plainly, professional but not warm. Patrols, runs counts, escorts inmates. Observes locations and movements carefully and does not pretend to be somewhere he isn't.";

const MONTY_AI_PERSONA =
  "A prison officer at Monty Correctional, a co-ed facility. Works the floor on this shift, supervising both wings. Brisk and procedural, professional but not warm. Patrols, runs counts, breaks up trouble between inmates. Observes locations and movements carefully and does not pretend to be somewhere she isn't.";

export const HARDGROVE: Prison = {
  id: "hardgrove",
  displayName: "Hardgrove Prison",
  aiName: "Prison Guard Oliver Jack",
  aiPersona: HARDGROVE_AI_PERSONA,
  humans: ["Officer Mark Hendricks", "Prisoner 928139, Mandy Brown"],
  inmates: [
    { name: "Mandy Brown", prisonerNumber: "928139", crime: "Domestic Battery" },
    { name: "Tara Delgado", prisonerNumber: "334872", crime: "Armed Robbery" },
    { name: "Keisha Monroe", prisonerNumber: "501047", crime: "Drug Trafficking" },
    { name: "Svetlana Voss", prisonerNumber: "762213", crime: "Wire Fraud" },
    { name: "Destiny Pruitt", prisonerNumber: "189564", crime: "Aggravated Assault" },
    { name: "Carmen Reyes", prisonerNumber: "447801", crime: "Extortion" },
    { name: "Niamh Callahan", prisonerNumber: "613398", crime: "Manslaughter" },
    { name: "Portia Wynn", prisonerNumber: "820056", crime: "Grand Larceny" },
    { name: "Yolanda Ferris", prisonerNumber: "275490", crime: "Arson" },
    { name: "Bex Nakamura", prisonerNumber: "094731", crime: "Identity Theft" },
    { name: "Rhonda Stokes", prisonerNumber: "558317", crime: "Conspiracy to Commit Murder" },
    { name: "Aaliya Osei", prisonerNumber: "703622", crime: "Kidnapping" },
  ],
};

export const MONTY: Prison = {
  id: "monty",
  displayName: "Monty Prison",
  aiName: "Prison Officer Sandy Sherlock",
  aiPersona: MONTY_AI_PERSONA,
  humans: ["Warden Abigail Richards", "Prisoner 999018, Martin Matthews"],
  inmates: [
    { name: "Martin Matthews", prisonerNumber: "999018", crime: "Armed Robbery" },
    { name: "Marcus Vance", prisonerNumber: "310445", crime: "Aggravated Assault" },
    { name: "Theo Kessler", prisonerNumber: "884712", crime: "Embezzlement" },
    { name: "Elena Voss", prisonerNumber: "197834", crime: "Drug Distribution" },
    { name: "Diego Aldridge", prisonerNumber: "654301", crime: "Felony Assault" },
    { name: "Kira Tanaka", prisonerNumber: "220987", crime: "Cybercrime" },
    { name: "Owen Marsh", prisonerNumber: "759102", crime: "Manslaughter" },
    { name: "Priya Chen", prisonerNumber: "406218", crime: "Conspiracy" },
  ],
};

export const PRISONS: Record<string, Prison> = {
  [HARDGROVE.id]: HARDGROVE,
  [MONTY.id]: MONTY,
};

export const PRISON_ORDER: readonly Prison[] = [HARDGROVE, MONTY];

export function getPrison(id: string | null | undefined): Prison | null {
  if (!id) return null;
  return PRISONS[id] ?? null;
}
