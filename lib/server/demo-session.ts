import 'server-only';

import { cookies } from 'next/headers';

const DEMO_GUEST_COOKIE = 'quiz-demo-guest';

export async function getDemoGuestSessionId() {
  return (await cookies()).get(DEMO_GUEST_COOKIE)?.value?.trim() ?? null;
}

export async function ensureDemoGuestSessionId() {
  const existing = await getDemoGuestSessionId();
  if (existing) {
    return existing;
  }

  const nextSessionId = globalThis.crypto.randomUUID();
  (await cookies()).set(DEMO_GUEST_COOKIE, nextSessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return nextSessionId;
}