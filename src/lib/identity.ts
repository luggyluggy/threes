import { cookies } from "next/headers";

const PRISON_COOKIE = "threes_prison";
const NAME_COOKIE = "threes_name";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

export interface Identity {
  prisonId: string;
  name: string;
}

export async function getPrisonId(): Promise<string | null> {
  const c = await cookies();
  return c.get(PRISON_COOKIE)?.value ?? null;
}

export async function getIdentity(): Promise<Identity | null> {
  const c = await cookies();
  const prisonId = c.get(PRISON_COOKIE)?.value;
  const name = c.get(NAME_COOKIE)?.value;
  if (!prisonId || !name) return null;
  return { prisonId, name };
}

export async function setPrisonId(prisonId: string): Promise<void> {
  const c = await cookies();
  c.set(PRISON_COOKIE, prisonId, COOKIE_OPTS);
}

export async function setName(name: string): Promise<void> {
  const c = await cookies();
  c.set(NAME_COOKIE, name, COOKIE_OPTS);
}

export async function clearIdentity(): Promise<void> {
  const c = await cookies();
  c.delete(PRISON_COOKIE);
  c.delete(NAME_COOKIE);
}

export async function clearName(): Promise<void> {
  const c = await cookies();
  c.delete(NAME_COOKIE);
}
