'use server';

import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { ConfigurationError } from '@/lib/env/shared';
import { getLocaleContext } from '@/lib/i18n/server';
import { getAppOperationalReadiness, getAppService } from '@/lib/server/app-service';
import { requireProtectedAuthorActor } from '@/lib/server/author-auth';
import {
  clearDemoPlayerBinding,
  ensureDemoGuestSessionId,
  ensureDemoHostSessionId,
  getDemoPlayerBinding,
  setDemoPlayerBinding,
} from '@/lib/server/demo-session';
import { writeStructuredLog, type StructuredLogMetadata } from '@/lib/server/observability';
import { QUIZ_IMAGE_ACCEPT_VALUE } from '@/lib/server/quiz-image-assets';
import { AuthorizationError, InvalidOperationError, NotFoundError } from '@/lib/server/service-errors';
import type { HostAllowedAction, QuestionType } from '@/lib/shared/contracts';

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function getOptionalInteger(formData: FormData, key: string) {
  const value = getString(formData, key).trim();
  return value ? Number.parseInt(value, 10) : undefined;
}

function getOptionalBoolean(formData: FormData, key: string) {
  const value = getString(formData, key).trim();
  if (!value) {
    return undefined;
  }
  return value === 'true';
}

function parseOptionMove(formData: FormData) {
  const encoded = getString(formData, 'optionMove');
  if (encoded) {
    const [optionId = '', direction = ''] = encoded.split(':');
    return { optionId, direction: direction === 'down' ? 'down' : 'up' } as const;
  }
  return {
    optionId: getString(formData, 'optionId'),
    direction: getString(formData, 'direction') === 'down' ? 'down' : 'up',
  } as const;
}

function parseQuestionMove(formData: FormData) {
  const encoded = getString(formData, 'questionMove');
  if (encoded) {
    const [questionId = '', direction = ''] = encoded.split(':');
    return { questionId, direction: direction === 'down' ? 'down' : 'up' } as const;
  }
  return {
    questionId: getString(formData, 'questionId'),
    direction: getString(formData, 'direction') === 'down' ? 'down' : 'up',
  } as const;
}

function parseQuestionOptions(formData: FormData) {
  return formData.getAll('optionId').flatMap((value) => {
    if (typeof value !== 'string' || !value.trim()) {
      return [];
    }
    return [{ optionId: value, text: getString(formData, `optionText:${value}`), isCorrect: formData.has(`optionCorrect:${value}`) }];
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

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

function requireUploadFile(formData: FormData, key: string) {
  const value = formData.get(key);
  if (!(value instanceof File) || value.size < 1) {
    throw new InvalidOperationError(`Choose a supported image file to upload (${QUIZ_IMAGE_ACCEPT_VALUE}).`);
  }
  return value;
}

function parseImageScope(formData: FormData) {
  const scope = getString(formData, 'scope').trim();
  if (scope.startsWith('question:')) {
    const [, questionId = ''] = scope.split(':');
    return { questionId, optionId: undefined };
  }
  if (scope.startsWith('option:')) {
    const [, questionId = '', optionId = ''] = scope.split(':');
    return { questionId, optionId };
  }
  return {
    questionId: getString(formData, 'questionId'),
    optionId: getString(formData, 'optionId') || undefined,
  };
}

function formatSafeError(error: unknown, fallback: string) {
  if (
    error instanceof ConfigurationError ||
    error instanceof AuthorizationError ||
    error instanceof InvalidOperationError ||
    error instanceof NotFoundError
  ) {
    return error.message;
  }
  return fallback;
}

async function requireProtectedAuthor() {
  return requireProtectedAuthorActor();
}

async function getSafeLocaleContext() {
  try {
    return await getLocaleContext();
  } catch {
    return {
      locale: 'cs' as const,
      dictionary: (await import('@/lib/i18n/dictionaries/cs')).default,
    };
  }
}

function logProtectedFlowFailure(event: string, error: unknown, metadata: StructuredLogMetadata) {
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
  const { dictionary } = await getSafeLocaleContext();
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
  } catch (error) {
    logProtectedFlowFailure('authoring.save_failed', error, { actorUserId, quizId });
    redirect(buildUrl('/authoring', { quizId, error: formatSafeError(error, dictionary.actionMessages.fallbacks.saveQuizDetails) }));
  }
  redirect(buildUrl('/authoring', { quizId, notice: dictionary.actionMessages.notices.draftSaved }));
}

export async function publishQuizAction(formData: FormData) {
  const { dictionary } = await getSafeLocaleContext();
  const quizId = getString(formData, 'quizId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().publishQuiz({ actor, quizId });
  } catch (error) {
    logProtectedFlowFailure('authoring.publish_failed', error, { actorUserId, quizId });
    redirect(buildUrl('/authoring', { quizId, error: formatSafeError(error, dictionary.actionMessages.fallbacks.publishQuiz) }));
  }
  redirect(buildUrl('/authoring', { quizId, notice: dictionary.actionMessages.notices.quizPublished }));
}

export async function addQuestionAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().addQuestion({ actor, quizId });
  } catch (error) {
    logProtectedFlowFailure('authoring.add_question_failed', error, { actorUserId, quizId });
    redirect(buildUrl('/authoring', { quizId, error: formatSafeError(error, 'Question could not be added.') }));
  }
  redirect(buildUrl('/authoring', { quizId, notice: 'Question added.' }));
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
  } catch (error) {
    logProtectedFlowFailure('authoring.save_question_failed', error, { actorUserId, quizId, questionId });
    redirect(buildUrl('/authoring', { quizId, error: formatSafeError(error, 'Question could not be saved.') }));
  }
  redirect(buildUrl('/authoring', { quizId, notice: 'Question saved.' }));
}

export async function moveQuestionAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  const { questionId, direction } = parseQuestionMove(formData);
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().moveQuestion({ actor, quizId, questionId, direction });
  } catch (error) {
    logProtectedFlowFailure('authoring.move_question_failed', error, { actorUserId, quizId, questionId, direction });
    redirect(buildUrl('/authoring', { quizId, error: formatSafeError(error, 'Question order could not be updated.') }));
  }
  redirect(buildUrl('/authoring', { quizId, notice: 'Question order updated.' }));
}

export async function deleteQuestionAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  const questionId = getString(formData, 'targetQuestionId') || getString(formData, 'questionId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().deleteQuestion({ actor, quizId, questionId });
  } catch (error) {
    logProtectedFlowFailure('authoring.delete_question_failed', error, { actorUserId, quizId, questionId });
    redirect(buildUrl('/authoring', { quizId, error: formatSafeError(error, 'Question could not be removed.') }));
  }
  redirect(buildUrl('/authoring', { quizId, notice: 'Question removed.' }));
}

export async function addOptionAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  const questionId = getString(formData, 'questionId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().addOption({ actor, quizId, questionId });
  } catch (error) {
    logProtectedFlowFailure('authoring.add_option_failed', error, { actorUserId, quizId, questionId });
    redirect(buildUrl('/authoring', { quizId, error: formatSafeError(error, 'Option could not be added.') }));
  }
  redirect(buildUrl('/authoring', { quizId, notice: 'Option added.' }));
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
  } catch (error) {
    logProtectedFlowFailure('authoring.move_option_failed', error, { actorUserId, quizId, questionId, optionId, direction });
    redirect(buildUrl('/authoring', { quizId, error: formatSafeError(error, 'Option order could not be updated.') }));
  }
  redirect(buildUrl('/authoring', { quizId, notice: 'Option order updated.' }));
}

export async function deleteOptionAction(formData: FormData) {
  const quizId = getString(formData, 'quizId');
  const questionId = getString(formData, 'questionId');
  const optionId = getString(formData, 'targetOptionId') || getString(formData, 'optionId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    await getAppService().deleteOption({ actor, quizId, questionId, optionId });
  } catch (error) {
    logProtectedFlowFailure('authoring.delete_option_failed', error, { actorUserId, quizId, questionId, optionId });
    redirect(buildUrl('/authoring', { quizId, error: formatSafeError(error, 'Option could not be removed.') }));
  }
  redirect(buildUrl('/authoring', { quizId, notice: 'Option removed.' }));
}

export async function uploadQuizImageAction(formData: FormData) {
  const { dictionary } = await getSafeLocaleContext();
  const quizId = getString(formData, 'quizId');
  const { questionId, optionId } = parseImageScope(formData);
  let actorUserId: string | null = null;
  let notice = dictionary.actionMessages.notices.questionImageSaved;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    const file = requireUploadFile(formData, 'image');
    if (optionId) {
      await getAppService().uploadOptionImage({ actor, quizId, questionId, optionId, file });
      notice = dictionary.actionMessages.notices.optionImageSaved;
    } else if (questionId) {
      await getAppService().uploadQuestionImage({ actor, quizId, questionId, file });
    } else {
      throw new InvalidOperationError('Choose a question or option image target before uploading.');
    }
  } catch (error) {
    logProtectedFlowFailure('authoring.save_image_failed', error, { actorUserId, quizId, questionId, optionId: optionId ?? null });
    redirect(buildUrl('/authoring', { quizId, error: formatSafeError(error, dictionary.actionMessages.fallbacks.saveQuizImage) }));
  }
  redirect(buildUrl('/authoring', { quizId, notice }));
}

export async function removeQuizImageAction(formData: FormData) {
  const { dictionary } = await getSafeLocaleContext();
  const quizId = getString(formData, 'quizId');
  const { questionId, optionId } = parseImageScope(formData);
  let actorUserId: string | null = null;
  let notice = dictionary.actionMessages.notices.questionImageRemoved;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    if (optionId) {
      await getAppService().removeOptionImage({ actor, quizId, questionId, optionId });
      notice = dictionary.actionMessages.notices.optionImageRemoved;
    } else if (questionId) {
      await getAppService().removeQuestionImage({ actor, quizId, questionId });
    } else {
      throw new InvalidOperationError('Choose a question or option image target before removing.');
    }
  } catch (error) {
    logProtectedFlowFailure('authoring.remove_image_failed', error, { actorUserId, quizId, questionId, optionId: optionId ?? null });
    redirect(buildUrl('/authoring', { quizId, error: formatSafeError(error, dictionary.actionMessages.fallbacks.removeQuizImage) }));
  }
  redirect(buildUrl('/authoring', { quizId, notice }));
}

export async function createRoomAction(formData: FormData) {
  const { dictionary } = await getSafeLocaleContext();
  const quizId = getString(formData, 'quizId');
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    const transportSessionId = getString(formData, 'transportSessionId').trim() || (await ensureDemoHostSessionId());
    const room = await getAppService().createRoom({ actor, quizId });
    getAppService().claimHost({ actor, roomCode: room.room_code, hostClaimToken: room.host_claim_token, transportSessionId });
    redirect(buildUrl('/host', { roomCode: room.room_code, notice: dictionary.actionMessages.notices.hostRoomCreated }));
  } catch (error) {
    logProtectedFlowFailure('host.create_room_failed', error, { actorUserId, quizId });
    redirect(buildUrl('/dashboard', { error: formatSafeError(error, dictionary.actionMessages.fallbacks.createRoom) }));
  }
}

export async function hostRoomAction(formData: FormData) {
  const { dictionary } = await getSafeLocaleContext();
  const roomCode = normalizeRoomCode(getString(formData, 'roomCode'));
  const action = getString(formData, 'action') as HostAllowedAction;
  let actorUserId: string | null = null;
  try {
    const actor = await requireProtectedAuthor();
    actorUserId = actor.clerkUserId;
    const transportSessionId = getString(formData, 'transportSessionId').trim() || (await ensureDemoHostSessionId());
    getAppService().performHostAction({ actor, roomCode, action, transportSessionId });
  } catch (error) {
    logProtectedFlowFailure('host.action_failed', error, { actorUserId, roomCode, action });
    redirect(buildUrl('/host', { roomCode, error: formatSafeError(error, dictionary.actionMessages.fallbacks.hostRoomAction) }));
  }
  redirect(buildUrl('/host', { roomCode, notice: dictionary.actionMessages.notices.hostActionApplied }));
}

export async function joinRoomAction(formData: FormData) {
  const { dictionary } = await getSafeLocaleContext();
  const roomCode = normalizeRoomCode(getString(formData, 'roomCode'));
  try {
    const binding = getAppService().joinRoom({
      guestSessionId: await ensureDemoGuestSessionId(),
      roomCode,
      displayName: getString(formData, 'displayName'),
    });
    await setDemoPlayerBinding(binding);
  } catch (error) {
    redirect(buildUrl('/join', { roomCode, error: formatSafeError(error, dictionary.actionMessages.fallbacks.joinRoom) }));
  }
  redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { notice: dictionary.actionMessages.notices.roomJoined }));
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
  } catch (error) {
    await clearDemoPlayerBinding(roomCode);
    redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { error: formatSafeError(error, 'Player session could not be reconnected.') }));
  }
  redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { notice: 'Player session reconnected.' }));
}

export async function submitAnswerAction(formData: FormData) {
  const { dictionary } = await getSafeLocaleContext();
  const roomCode = normalizeRoomCode(getString(formData, 'roomCode'));
  try {
    getAppService().submitAnswer({
      guestSessionId: await ensureDemoGuestSessionId(),
      roomCode,
      selectedOptionIds: formData.getAll('selectedOptionIds').flatMap((value) => (typeof value === 'string' ? [value] : [])),
    });
  } catch (error) {
    redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { error: formatSafeError(error, dictionary.actionMessages.fallbacks.submitAnswer) }));
  }
  redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { notice: dictionary.actionMessages.notices.answerSubmitted }));
}