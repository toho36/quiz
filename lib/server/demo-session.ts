import { cookies } from 'next/headers';

const DEMO_GUEST_COOKIE = 'quiz-demo-guest';
const DEMO_HOST_COOKIE = 'quiz-demo-host';
const DEMO_PLAYER_COOKIE = 'quiz-demo-player-bindings';

export type DemoPlayerBindingCookie = {
  roomId: string;
  roomCode: string;
  roomPlayerId: string;
  resumeToken: string;
  resumeExpiresAt: string;
};

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

async function readPlayerBindings() {
  const encoded = (await cookies()).get(DEMO_PLAYER_COOKIE)?.value?.trim();
  if (!encoded) {
    return {} as Record<string, DemoPlayerBindingCookie>;
  }
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, DemoPlayerBindingCookie>;
  } catch {
    return {} as Record<string, DemoPlayerBindingCookie>;
  }
}

async function writePlayerBindings(bindings: Record<string, DemoPlayerBindingCookie>) {
  (await cookies()).set(DEMO_PLAYER_COOKIE, Buffer.from(JSON.stringify(bindings)).toString('base64url'), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
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

export async function getDemoHostSessionId() {
  return (await cookies()).get(DEMO_HOST_COOKIE)?.value?.trim() ?? null;
}

export async function ensureDemoHostSessionId() {
  const existing = await getDemoHostSessionId();
  if (existing) {
    return existing;
  }

  const nextSessionId = globalThis.crypto.randomUUID();
  (await cookies()).set(DEMO_HOST_COOKIE, nextSessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return nextSessionId;
}

export async function getDemoPlayerBinding(roomCode: string) {
  const bindings = await readPlayerBindings();
  return bindings[normalizeRoomCode(roomCode)] ?? null;
}

export async function setDemoPlayerBinding(binding: DemoPlayerBindingCookie) {
  const bindings = await readPlayerBindings();
  bindings[normalizeRoomCode(binding.roomCode)] = {
    ...binding,
    roomCode: normalizeRoomCode(binding.roomCode),
  };
  await writePlayerBindings(bindings);
}

export async function clearDemoPlayerBinding(roomCode: string) {
  const bindings = await readPlayerBindings();
  delete bindings[normalizeRoomCode(roomCode)];
  await writePlayerBindings(bindings);
}