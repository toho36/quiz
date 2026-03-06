import 'server-only';

import { cookies } from 'next/headers';
import { demoAuthorActor } from '@/lib/server/demo-app-service';

const DEMO_AUTHOR_COOKIE = 'quiz-demo-author';
const DEMO_GUEST_COOKIE = 'quiz-demo-guest';

export async function getDemoAuthorActor() {
  return (await cookies()).get(DEMO_AUTHOR_COOKIE)?.value === 'signed-in' ? demoAuthorActor : null;
}

export async function signInDemoAuthor() {
  (await cookies()).set(DEMO_AUTHOR_COOKIE, 'signed-in', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
}

export async function signOutDemoAuthor() {
  (await cookies()).delete(DEMO_AUTHOR_COOKIE);
}

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