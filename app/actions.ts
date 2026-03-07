'use server';

import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { ConfigurationError } from '@/lib/env/shared';
import { writeStructuredLog, type StructuredLogMetadata } from '@/lib/server/observability';
import { getAppOperationalReadiness, getAppService } from '@/lib/server/app-service';
import { requireProtectedAuthorActor } from '@/lib/server/author-auth';
import {
  clearDemoPlayerBinding,
  ensureDemoGuestSessionId,
  ensureDemoHostSessionId,
  getDemoPlayerBinding,
  setDemoPlayerBinding,
} from '@/lib/server/demo-session';
import { AuthorizationError, InvalidOperationError, NotFoundError } from '@/lib/server/service-errors';
import type { HostAllowedAction, QuestionType } from '@/lib/shared/contracts';

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function getOptionalInteger(formData: FormData, key: string) {
  const value = getString(formData, key).trim();
  if (!value) {
    return undefined;
  }

  return Number.parseInt(value, 10);
}

function getOptionalBoolean(formData: FormData, key: string) {
  const value = getString(formData, key).trim();
  if (!value) {
    return undefined;
  }

  return value === 'true';
}

function parseOptionMove(formData: FormData) {
  const [optionId = '', direction = ''] = getString(formData, 'optionMove').split(':');
  return {
    optionId,
    direction: direction === 'down' ? 'down' : 'up',
  } as const;
}

function parseQuestionOptions(formData: FormData) {
  return formData.getAll('optionId').flatMap((value) => {
    if (typeof value !== 'string' || !value.trim()) {
      return [];
    }

    return [
      {
        optionId: value,
        text: getString(formData, `optionText:${value}`),
        isCorrect: formData.has(`optionCorrect:${value}`),
      },
    ];
  });
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

function logProtectedFlowFailure(
  event: string,
  error: unknown,
  metadata: StructuredLogMetadata,
) {
  const readiness = getAppOperationalReadiness();
  writeStructuredLog({
    level: 'error',
    event,
    error,
    metadata,
    extra: {
      readiness: {
        authoringConfigured: readiness.authoring.isConfigured,
        missingAuthoringKeys: readiness.authoring.missingKeys,
        canCreateRooms: readiness.runtime.canCreateRooms,
        canIssueHostClaims: readiness.runtime.canIssueHostClaims,
        missingRuntimeKeys: readiness.runtime.missing,
      },
    },
  });
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

export async function addQuestionAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().addQuestion({ actor, quizId });
    redirect(buildUrl('/authoring', { quizId, notice: 'Question added.' }));
  } catch (error) {
    logProtectedFlowFailure('authoring.add_question_failed', error, { actorUserId, quizId });
    redirect(buildUrl('/authoring', { quizId, error: formatError(error) }));
  }
}

export async function saveQuestionAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  const questionId = getString(formData, 'questionId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().saveQuestion({
      actor,
      quizId,
      questionId,
      prompt: getString(formData, 'prompt'),
      questionType: getString(formData, 'questionType') as QuestionType,
      basePoints: Number.parseInt(getString(formData, 'basePoints'), 10),
      timeLimitSeconds: getOptionalInteger(formData, 'timeLimitSeconds'),
      shuffleAnswers: getOptionalBoolean(formData, 'shuffleAnswers'),
      options: parseQuestionOptions(formData),
    });
    redirect(buildUrl('/authoring', { quizId, notice: 'Question saved.' }));
  } catch (error) {
    logProtectedFlowFailure('authoring.save_question_failed', error, { actorUserId, quizId, questionId });
    redirect(buildUrl('/authoring', { quizId, error: formatError(error) }));
  }
}

export async function moveQuestionAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  const questionId = getString(formData, 'questionId');
  const direction = getString(formData, 'direction') === 'down' ? 'down' : 'up';
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().moveQuestion({ actor, quizId, questionId, direction });
    redirect(buildUrl('/authoring', { quizId, notice: 'Question order updated.' }));
  } catch (error) {
    logProtectedFlowFailure('authoring.move_question_failed', error, { actorUserId, quizId, questionId, direction });
    redirect(buildUrl('/authoring', { quizId, error: formatError(error) }));
  }
}

export async function deleteQuestionAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  const questionId = getString(formData, 'questionId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().deleteQuestion({ actor, quizId, questionId });
    redirect(buildUrl('/authoring', { quizId, notice: 'Question removed.' }));
  } catch (error) {
    logProtectedFlowFailure('authoring.delete_question_failed', error, { actorUserId, quizId, questionId });
    redirect(buildUrl('/authoring', { quizId, error: formatError(error) }));
  }
}

export async function addOptionAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  const questionId = getString(formData, 'questionId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().addOption({ actor, quizId, questionId });
    redirect(buildUrl('/authoring', { quizId, notice: 'Option added.' }));
  } catch (error) {
    logProtectedFlowFailure('authoring.add_option_failed', error, { actorUserId, quizId, questionId });
    redirect(buildUrl('/authoring', { quizId, error: formatError(error) }));
  }
}

export async function moveOptionAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  const questionId = getString(formData, 'questionId');
  const { optionId, direction } = parseOptionMove(formData);
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().moveOption({ actor, quizId, questionId, optionId, direction });
    redirect(buildUrl('/authoring', { quizId, notice: 'Option order updated.' }));
  } catch (error) {
    logProtectedFlowFailure('authoring.move_option_failed', error, { actorUserId, quizId, questionId, optionId, direction });
    redirect(buildUrl('/authoring', { quizId, error: formatError(error) }));
  }
}

export async function deleteOptionAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  const questionId = getString(formData, 'questionId');
  const optionId = getString(formData, 'targetOptionId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().deleteOption({ actor, quizId, questionId, optionId });
    redirect(buildUrl('/authoring', { quizId, notice: 'Option removed.' }));
  } catch (error) {
    logProtectedFlowFailure('authoring.delete_option_failed', error, { actorUserId, quizId, questionId, optionId });
    redirect(buildUrl('/authoring', { quizId, error: formatError(error) }));
  }
}

export async function createRoomAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    const hostSessionId = await ensureDemoHostSessionId();
    const room = await getAppService().createRoom({ actor, quizId });
    getAppService().claimHost({
      actor,
      roomCode: room.room_code,
      hostClaimToken: room.host_claim_token,
      transportSessionId: hostSessionId,
    });
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
    const hostSessionId = await ensureDemoHostSessionId();
    getAppService().performHostAction({
      actor,
      roomCode,
      action,
      transportSessionId: hostSessionId,
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
    const binding = getAppService().joinRoom({
      guestSessionId: await ensureDemoGuestSessionId(),
      roomCode,
      displayName: getString(formData, 'displayName'),
    });
    await setDemoPlayerBinding(binding);
    redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { notice: 'Joined room.' }));
  } catch (error) {
    redirect(buildUrl('/join', { roomCode, error: formatError(error) }));
  }
}

export async function reconnectRoomAction(formData: FormData) {
  const roomCode = normalizeRoomCode(getString(formData, 'roomCode'));
  const storedBinding = await getDemoPlayerBinding(roomCode);
  if (!storedBinding) {
    redirect(buildUrl('/join', { roomCode, error: 'Reconnect requires an existing player resume token.' }));
  }

  try {
    const binding = getAppService().reconnectPlayer({
      guestSessionId: await ensureDemoGuestSessionId(),
      roomCode,
      roomId: storedBinding.roomId,
      roomPlayerId: storedBinding.roomPlayerId,
      resumeToken: storedBinding.resumeToken,
    });
    await setDemoPlayerBinding(binding);
    redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { notice: 'Player session reconnected.' }));
  } catch (error) {
    await clearDemoPlayerBinding(roomCode);
    redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { error: formatError(error) }));
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