'use server';

import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { getDemoAppService } from '@/lib/server/demo-app-service';
import { ensureDemoGuestSessionId, getDemoAuthorActor, signInDemoAuthor, signOutDemoAuthor } from '@/lib/server/demo-session';
import { AuthorizationError } from '@/lib/server/service-errors';
import type { HostAllowedAction } from '@/lib/shared/contracts';

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function buildUrl(pathname: Route, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return (query ? `${pathname}?${query}` : pathname) as Route;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong';
}

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

async function requireDemoAuthor() {
  const actor = await getDemoAuthorActor();
  if (!actor) {
    throw new AuthorizationError('Sign in as the demo author to continue');
  }
  return actor;
}

export async function signInDemoAuthorAction(formData: FormData) {
  await signInDemoAuthor();
  const next = getString(formData, 'next');
  redirect(next.startsWith('/') ? (next as Route) : '/dashboard');
}

export async function signOutDemoAuthorAction() {
  await signOutDemoAuthor();
  redirect('/');
}

export async function saveQuizDetailsAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  try {
    await getDemoAppService().saveQuizDetails({
      actor: await requireDemoAuthor(),
      quizId,
      title: getString(formData, 'title'),
      description: getString(formData, 'description'),
    });
    redirect(buildUrl('/authoring', { quizId, notice: 'Draft saved.' }));
  } catch (error) {
    redirect(buildUrl('/authoring', { quizId, error: formatError(error) }));
  }
}

export async function publishQuizAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  try {
    await getDemoAppService().publishQuiz({ actor: await requireDemoAuthor(), quizId });
    redirect(buildUrl('/authoring', { quizId, notice: 'Quiz published and ready for hosting.' }));
  } catch (error) {
    redirect(buildUrl('/authoring', { quizId, error: formatError(error) }));
  }
}

export async function createRoomAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  try {
    const room = await getDemoAppService().createRoom({ actor: await requireDemoAuthor(), quizId });
    redirect(buildUrl('/host', { roomCode: room.room_code, notice: 'Host room created.' }));
  } catch (error) {
    redirect(buildUrl('/dashboard', { error: formatError(error) }));
  }
}

export async function hostRoomAction(formData: FormData) {
  const roomCode = normalizeRoomCode(getString(formData, 'roomCode'));
  const action = getString(formData, 'action') as HostAllowedAction;
  try {
    getDemoAppService().performHostAction({
      actor: await requireDemoAuthor(),
      roomCode,
      action,
    });
    redirect(buildUrl('/host', { roomCode, notice: 'Host action applied.' }));
  } catch (error) {
    redirect(buildUrl('/host', { roomCode, error: formatError(error) }));
  }
}

export async function joinRoomAction(formData: FormData) {
  const roomCode = normalizeRoomCode(getString(formData, 'roomCode'));
  try {
    getDemoAppService().joinRoom({
      guestSessionId: await ensureDemoGuestSessionId(),
      roomCode,
      displayName: getString(formData, 'displayName'),
    });
    redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { notice: 'Joined room.' }));
  } catch (error) {
    redirect(buildUrl('/join', { roomCode, error: formatError(error) }));
  }
}

export async function submitAnswerAction(formData: FormData) {
  const roomCode = normalizeRoomCode(getString(formData, 'roomCode'));
  try {
    getDemoAppService().submitAnswer({
      guestSessionId: await ensureDemoGuestSessionId(),
      roomCode,
      selectedOptionIds: formData.getAll('selectedOptionIds').flatMap((value) => (typeof value === 'string' ? [value] : [])),
    });
    redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { notice: 'Answer submitted.' }));
  } catch (error) {
    redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { error: formatError(error) }));
  }
}