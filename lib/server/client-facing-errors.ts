import type { LocaleDictionary } from '@/lib/i18n/dictionary';
import { AuthorizationError, InvalidOperationError } from '@/lib/server/service-errors';

const SAFE_INVALID_OPERATION_PATTERNS = [
  /^Choose a supported image file to upload /,
  /^Choose a PNG, JPEG, or WebP image to upload\.$/,
  /^Only PNG, JPEG, and WebP images are supported\.$/,
  /^Images must be \d+ MiB or smaller\.$/,
  /^Images must be \d+×\d+ or smaller\.$/,
  /^Could not read image dimensions from the uploaded (PNG|JPEG|WebP image)\.$/,
  /^Quiz image storage is full\./,
  /^Archived quizzes cannot be republished /,
  /^Only published quizzes can bootstrap runtime rooms$/,
  /^Expired rooms are no longer readable$/,
  /^No active question is available(?: to close)?$/,
  /^No closed question is available to reveal$/,
  /^No revealed question is available for leaderboard display$/,
  /^No leaderboard state is active$/,
  /^More questions remain before the game can finish$/,
  /^Room already joined in this guest session$/,
  /^Late join is rejected once gameplay is active$/,
  /^Only lobby rooms can start gameplay$/,
  /^start_game requires at least one frozen question snapshot$/,
  /^Only lobby or in-progress rooms can be aborted$/,
  /^Expected [a-z_]+ before this transition$/,
  /^Gameplay actions require an in-progress room$/,
  /^Gameplay actions must target the active room question snapshot$/,
];

function isSafeInvalidOperationMessage(message: string) {
  return SAFE_INVALID_OPERATION_PATTERNS.some((pattern) => pattern.test(message));
}

function formatLocalizedSafeInvalidOperationMessage(message: string, copy: LocaleDictionary['actionMessages']['errors']) {
  if (/^Choose a supported image file to upload /.test(message)) {
    return copy.uploadImageRequired;
  }

  if (/^Choose a PNG, JPEG, or WebP image to upload\.$/.test(message) || /^Only PNG, JPEG, and WebP images are supported\.$/.test(message)) {
    return copy.imageTypeRequired;
  }

  if (/^Images must be \d+ MiB or smaller\.$/.test(message)) {
    return copy.imageTooLarge;
  }

  if (/^Images must be \d+×\d+ or smaller\.$/.test(message)) {
    return copy.imageTooWideOrTall;
  }

  if (/^Could not read image dimensions from the uploaded (PNG|JPEG|WebP image)\.$/.test(message)) {
    return copy.unreadableImageDimensions;
  }

  if (/^Quiz image storage is full\./.test(message)) {
    return copy.imageStorageFull;
  }

  if (/^Archived quizzes cannot be republished /.test(message)) {
    return copy.archivedQuizRepublishBlocked;
  }

  if (/^Only published quizzes can bootstrap runtime rooms$/.test(message)) {
    return copy.publishedQuizRequiredForRoom;
  }

  if (/^Expired rooms are no longer readable$/.test(message)) {
    return copy.expiredRoom;
  }

  if (/^No active question is available(?: to close)?$/.test(message)) {
    return copy.noActiveQuestion;
  }

  if (/^No closed question is available to reveal$/.test(message)) {
    return copy.noClosedQuestion;
  }

  if (/^No revealed question is available for leaderboard display$/.test(message)) {
    return copy.noRevealedQuestion;
  }

  if (/^No leaderboard state is active$/.test(message)) {
    return copy.noLeaderboard;
  }

  if (/^More questions remain before the game can finish$/.test(message)) {
    return copy.moreQuestionsRemain;
  }

  if (/^Room already joined in this guest session$/.test(message)) {
    return copy.roomAlreadyJoined;
  }

  if (/^Late join is rejected once gameplay is active$/.test(message)) {
    return copy.lateJoinRejected;
  }

  if (/^Only lobby rooms can start gameplay$/.test(message)) {
    return copy.lobbyRequiredToStart;
  }

  if (/^start_game requires at least one frozen question snapshot$/.test(message)) {
    return copy.startGameRequiresSnapshot;
  }

  if (/^Only lobby or in-progress rooms can be aborted$/.test(message)) {
    return copy.abortRequiresLobbyOrInProgress;
  }

  if (/^Expected [a-z_]+ before this transition$/.test(message)) {
    return copy.invalidTransition;
  }

  if (/^Gameplay actions require an in-progress room$/.test(message)) {
    return copy.inProgressRoomRequired;
  }

  if (/^Gameplay actions must target the active room question snapshot$/.test(message)) {
    return copy.activeQuestionRequired;
  }

  return null;
}

export function formatClientFacingError(error: unknown, fallback: string) {
  if (error instanceof AuthorizationError) {
    return error.message;
  }

  if (error instanceof InvalidOperationError && isSafeInvalidOperationMessage(error.message)) {
    return error.message;
  }

  return fallback;
}

export function formatLocalizedClientFacingError(
  error: unknown,
  copy: LocaleDictionary['actionMessages']['errors'],
  fallback: string,
) {
  if (error instanceof AuthorizationError) {
    return copy.demoAuthorRequired;
  }

  if (error instanceof InvalidOperationError && isSafeInvalidOperationMessage(error.message)) {
    return formatLocalizedSafeInvalidOperationMessage(error.message, copy) ?? fallback;
  }

  return fallback;
}