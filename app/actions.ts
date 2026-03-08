'use server';

import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { getLocaleContext } from '@/lib/i18n/server';
import { getDemoAppService } from '@/lib/server/demo-app-service';
import { QUIZ_IMAGE_ACCEPT_VALUE } from '@/lib/server/quiz-image-assets';
import { formatLocalizedClientFacingError } from '@/lib/server/client-facing-errors';
import { ensureDemoGuestSessionId, getDemoAuthorActor, signInDemoAuthor, signOutDemoAuthor } from '@/lib/server/demo-session';
import { AuthorizationError, InvalidOperationError } from '@/lib/server/service-errors';
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

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

function getOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requireUploadFile(
  formData: FormData,
  key: string,
) {
  const value = formData.get(key);
  if (!(value instanceof File) || value.size < 1) {
    throw new InvalidOperationError(`Choose a supported image file to upload (${QUIZ_IMAGE_ACCEPT_VALUE}).`);
  }
  return value;
}

async function requireDemoAuthor(errorCopy: Awaited<ReturnType<typeof getLocaleContext>>['dictionary']['actionMessages']['errors']) {
  const actor = await getDemoAuthorActor();
  if (!actor) {
    throw new AuthorizationError(errorCopy.demoAuthorRequired);
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
  const { dictionary } = await getLocaleContext();
  const quizId = getString(formData, 'quizId');

  try {
    await getDemoAppService().saveQuizDetails({
      actor: await requireDemoAuthor(dictionary.actionMessages.errors),
      quizId,
      title: getString(formData, 'title'),
      description: getString(formData, 'description'),
    });
  } catch (error) {
    redirect(buildUrl('/authoring', {
      quizId,
      error: formatLocalizedClientFacingError(error, dictionary.actionMessages.errors, dictionary.actionMessages.fallbacks.saveQuizDetails),
    }));
  }

  redirect(buildUrl('/authoring', { quizId, notice: dictionary.actionMessages.notices.draftSaved }));
}

export async function publishQuizAction(formData: FormData) {
  const { dictionary } = await getLocaleContext();
  const quizId = getString(formData, 'quizId');

  try {
    await getDemoAppService().publishQuiz({ actor: await requireDemoAuthor(dictionary.actionMessages.errors), quizId });
  } catch (error) {
    redirect(buildUrl('/authoring', {
      quizId,
      error: formatLocalizedClientFacingError(error, dictionary.actionMessages.errors, dictionary.actionMessages.fallbacks.publishQuiz),
    }));
  }

  redirect(buildUrl('/authoring', { quizId, notice: dictionary.actionMessages.notices.quizPublished }));
}

export async function uploadQuizImageAction(formData: FormData) {
  const { dictionary } = await getLocaleContext();
  const quizId = getString(formData, 'quizId');
  const questionId = getString(formData, 'questionId');
  const optionId = getOptionalString(formData, 'optionId');
  let notice = dictionary.actionMessages.notices.questionImageSaved;

  try {
    const actor = await requireDemoAuthor(dictionary.actionMessages.errors);
    const file = requireUploadFile(formData, 'image');
    if (optionId) {
      await getDemoAppService().uploadOptionImage({ actor, quizId, questionId, optionId, file });
      notice = dictionary.actionMessages.notices.optionImageSaved;
    } else {
      await getDemoAppService().uploadQuestionImage({ actor, quizId, questionId, file });
    }
  } catch (error) {
    redirect(buildUrl('/authoring', {
      quizId,
      error: formatLocalizedClientFacingError(error, dictionary.actionMessages.errors, dictionary.actionMessages.fallbacks.saveQuizImage),
    }));
  }

  redirect(buildUrl('/authoring', { quizId, notice }));
}

export async function removeQuizImageAction(formData: FormData) {
  const { dictionary } = await getLocaleContext();
  const quizId = getString(formData, 'quizId');
  const questionId = getString(formData, 'questionId');
  const optionId = getOptionalString(formData, 'optionId');
  let notice = dictionary.actionMessages.notices.questionImageRemoved;

  try {
    const actor = await requireDemoAuthor(dictionary.actionMessages.errors);
    if (optionId) {
      await getDemoAppService().removeOptionImage({ actor, quizId, questionId, optionId });
      notice = dictionary.actionMessages.notices.optionImageRemoved;
    } else {
      await getDemoAppService().removeQuestionImage({ actor, quizId, questionId });
    }
  } catch (error) {
    redirect(buildUrl('/authoring', {
      quizId,
      error: formatLocalizedClientFacingError(error, dictionary.actionMessages.errors, dictionary.actionMessages.fallbacks.removeQuizImage),
    }));
  }

  redirect(buildUrl('/authoring', { quizId, notice }));
}

export async function createRoomAction(formData: FormData) {
  const { dictionary } = await getLocaleContext();
  const quizId = getString(formData, 'quizId');
  let roomCode = '';

  try {
    const room = await getDemoAppService().createRoom({ actor: await requireDemoAuthor(dictionary.actionMessages.errors), quizId });
    roomCode = room.room_code;
  } catch (error) {
    redirect(buildUrl('/dashboard', {
      error: formatLocalizedClientFacingError(error, dictionary.actionMessages.errors, dictionary.actionMessages.fallbacks.createRoom),
    }));
  }

  redirect(buildUrl('/host', { roomCode, notice: dictionary.actionMessages.notices.hostRoomCreated }));
}

export async function hostRoomAction(formData: FormData) {
  const { dictionary } = await getLocaleContext();
  const roomCode = normalizeRoomCode(getString(formData, 'roomCode'));
  const action = getString(formData, 'action') as HostAllowedAction;

  try {
    getDemoAppService().performHostAction({
      actor: await requireDemoAuthor(dictionary.actionMessages.errors),
      roomCode,
      action,
    });
  } catch (error) {
    redirect(buildUrl('/host', {
      roomCode,
      error: formatLocalizedClientFacingError(error, dictionary.actionMessages.errors, dictionary.actionMessages.fallbacks.hostRoomAction),
    }));
  }

  redirect(buildUrl('/host', { roomCode, notice: dictionary.actionMessages.notices.hostActionApplied }));
}

export async function joinRoomAction(formData: FormData) {
  const { dictionary } = await getLocaleContext();
  const roomCode = normalizeRoomCode(getString(formData, 'roomCode'));

  try {
    getDemoAppService().joinRoom({
      guestSessionId: await ensureDemoGuestSessionId(),
      roomCode,
      displayName: getString(formData, 'displayName'),
    });
  } catch (error) {
    redirect(buildUrl('/join', {
      roomCode,
      error: formatLocalizedClientFacingError(error, dictionary.actionMessages.errors, dictionary.actionMessages.fallbacks.joinRoom),
    }));
  }

  redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { notice: dictionary.actionMessages.notices.roomJoined }));
}

export async function submitAnswerAction(formData: FormData) {
  const { dictionary } = await getLocaleContext();
  const roomCode = normalizeRoomCode(getString(formData, 'roomCode'));

  try {
    getDemoAppService().submitAnswer({
      guestSessionId: await ensureDemoGuestSessionId(),
      roomCode,
      selectedOptionIds: formData.getAll('selectedOptionIds').flatMap((value) => (typeof value === 'string' ? [value] : [])),
    });
  } catch (error) {
    redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, {
      error: formatLocalizedClientFacingError(error, dictionary.actionMessages.errors, dictionary.actionMessages.fallbacks.submitAnswer),
    }));
  }

  redirect(buildUrl(`/play/${encodeURIComponent(roomCode)}` as Route, { notice: dictionary.actionMessages.notices.answerSubmitted }));
}