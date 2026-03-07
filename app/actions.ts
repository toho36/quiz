'use server';

import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { ConfigurationError } from '@/lib/env/shared';
import { getAppOperationalReadiness, getAppService } from '@/lib/server/app-service';
import { requireProtectedAuthorActor } from '@/lib/server/author-auth';
import { ensureDemoGuestSessionId } from '@/lib/server/demo-session';
import { AuthorizationError, InvalidOperationError, NotFoundError } from '@/lib/server/service-errors';
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
  if (
    error instanceof ConfigurationError ||
    error instanceof AuthorizationError ||
    error instanceof InvalidOperationError ||
    error instanceof NotFoundError
  ) {
    return error.message;
  }

  return 'The request could not be completed. Check runtime readiness and server logs.';
}

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

async function requireProtectedAuthor() {
  return requireProtectedAuthorActor();
}

function sanitizeForLog(value: string) {
  return [process.env.CLERK_SECRET_KEY, process.env.SPACETIME_ADMIN_TOKEN, process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY]
    .filter((secret): secret is string => Boolean(secret))
    .reduce((current, secret) => current.split(secret).join('[redacted]'), value);
}

function logProtectedFlowFailure(
  event: string,
  error: unknown,
  metadata: Record<string, string | null | string[] | boolean>,
) {
  const readiness = getAppOperationalReadiness();
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  const errorMessage = sanitizeForLog(error instanceof Error ? error.message : String(error));

  console.error(
    JSON.stringify({
      event,
      environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'unknown',
      errorName,
      errorMessage,
      metadata,
      readiness: {
        authoringConfigured: readiness.authoring.isConfigured,
        missingAuthoringKeys: readiness.authoring.missingKeys,
        canCreateRooms: readiness.runtime.canCreateRooms,
        canIssueHostClaims: readiness.runtime.canIssueHostClaims,
        missingRuntimeKeys: readiness.runtime.missing,
      },
    }),
  );
}

export async function saveQuizDetailsAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().saveQuizDetails({
      actor,
      quizId,
      title: getString(formData, 'title'),
      description: getString(formData, 'description'),
    });
    redirect(buildUrl('/authoring', { quizId, notice: 'Draft saved.' }));
  } catch (error) {
    logProtectedFlowFailure('authoring.save_failed', error, { actorUserId, quizId });
    redirect(buildUrl('/authoring', { quizId, error: formatError(error) }));
  }
}

export async function publishQuizAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().publishQuiz({ actor, quizId });
    redirect(buildUrl('/authoring', { quizId, notice: 'Quiz published and ready for hosting.' }));
  } catch (error) {
    logProtectedFlowFailure('authoring.publish_failed', error, { actorUserId, quizId });
    redirect(buildUrl('/authoring', { quizId, error: formatError(error) }));
  }
}

export async function createRoomAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    const room = await getAppService().createRoom({ actor, quizId });
    redirect(buildUrl('/host', { roomCode: room.room_code, notice: 'Host room created.' }));
  } catch (error) {
    logProtectedFlowFailure('host.create_room_failed', error, { actorUserId, quizId });
    redirect(buildUrl('/dashboard', { error: formatError(error) }));
  }
}

export async function hostRoomAction(formData: FormData) {
  const roomCode = normalizeRoomCode(getString(formData, 'roomCode'));
  const action = getString(formData, 'action') as HostAllowedAction;
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    getAppService().performHostAction({
      actor,
      roomCode,
      action,
    });
    redirect(buildUrl('/host', { roomCode, notice: 'Host action applied.' }));
  } catch (error) {
    logProtectedFlowFailure('host.action_failed', error, { action, actorUserId, roomCode });
    redirect(buildUrl('/host', { roomCode, error: formatError(error) }));
  }
}

export async function joinRoomAction(formData: FormData) {
  const roomCode = normalizeRoomCode(getString(formData, 'roomCode'));
  try {
    getAppService().joinRoom({
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
    getAppService().submitAnswer({
      guestSessionId: await ensureDemoGuestSessionId(),
      roomCode,
      selectedOptionIds: formData.getAll('selectedOptionIds').flatMap((value) => (typeof value === 'string' ? [value] : [])),
    });
    redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { notice: 'Answer submitted.' }));
  } catch (error) {
    redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { error: formatError(error) }));
  }
}