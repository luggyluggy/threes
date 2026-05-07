import { cookies } from "next/headers";

const COOKIE_NAME = "threes_name";

export async function getName(): Promise<string | null> {
  const c = await cookies();
  return c.get(COOKIE_NAME)?.value ?? null;
}

export async function setName(name: string): Promise<void> {
  const c = await cookies();
  c.set(COOKIE_NAME, name, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
