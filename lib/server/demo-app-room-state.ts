import type { AcceptedAnswerSubmission } from '@/lib/server/runtime-gameplay-service';
import type {
  HostAllowedAction,
  HostRoomState,
  PlayerLatestOutcome,
  PlayerRoomState,
  RuntimeQuestionOptionSnapshot,
  RuntimeQuestionSnapshot,
  RuntimeQuestionState,
  RuntimeRoom,
} from '@/lib/shared/contracts';

export type RoomStateSession = {
  room: RuntimeRoom;
  questionSnapshots: RuntimeQuestionSnapshot[];
  optionSnapshots: RuntimeQuestionOptionSnapshot[];
  questionState: RuntimeQuestionState | null;
  acceptedSubmissions: AcceptedAnswerSubmission[];
  latestOutcomes: Record<string, PlayerLatestOutcome | null>;
  leaderboard: HostRoomState['leaderboard'];
};

export function getQuestionSnapshotsForRoom(session: RoomStateSession) {
  return [...session.questionSnapshots].sort((left, right) => left.question_index - right.question_index);
}

export function getCurrentQuestionSnapshot(session: RoomStateSession) {
  const index = session.room.current_question_index;
  if (index === null) {
    return null;
  }

  return session.questionSnapshots.find((question) => question.question_index === index) ?? null;
}

export function getCurrentOptionSnapshots(session: RoomStateSession) {
  const current = getCurrentQuestionSnapshot(session);
  if (!current) {
    return [];
  }

  return session.optionSnapshots
    .filter((option) => option.question_index === current.question_index)
    .sort((left, right) => left.display_position - right.display_position);
}

export function buildSharedRoom(session: RoomStateSession) {
  const gameplayActive = session.room.lifecycle_state === 'in_progress';
  return {
    room_id: session.room.room_id,
    room_code: session.room.room_code,
    lifecycle_state: session.room.lifecycle_state,
    question_index: session.room.current_question_index,
    question_phase: gameplayActive ? session.questionState?.phase ?? null : null,
    question_deadline_at: gameplayActive ? session.questionState?.deadline_at ?? null : null,
    room_policy: session.room.room_policy,
  };
}

export function buildActiveQuestion(session: RoomStateSession): PlayerRoomState['active_question'] {
  const question = getCurrentQuestionSnapshot(session);
  if (!question || session.room.lifecycle_state !== 'in_progress') {
    return null;
  }

  return {
    question_index: question.question_index,
    prompt: question.prompt,
    question_type: question.question_type,
    display_options: getCurrentOptionSnapshots(session).map((option) => ({
      option_id: option.source_option_id,
      display_position: option.display_position,
      text: option.text,
    })),
  };
}

export function buildPlayerSubmissionStatus(
  session: RoomStateSession,
  roomPlayerId: string,
): PlayerRoomState['self']['submission_status'] {
  if (session.room.lifecycle_state === 'lobby') {
    return 'not_submitted';
  }
  if (session.room.lifecycle_state !== 'in_progress') {
    return session.latestOutcomes[roomPlayerId] ? 'accepted' : 'no_answer';
  }

  const currentQuestionIndex = session.room.current_question_index;
  if (currentQuestionIndex === null) {
    return 'not_submitted';
  }

  const hasAcceptedSubmission = session.acceptedSubmissions.some(
    (submission) => submission.room_player_id === roomPlayerId && submission.question_index === currentQuestionIndex,
  );
  if (hasAcceptedSubmission) {
    return session.questionState?.phase === 'question_open' ? 'submitted' : 'accepted';
  }

  return session.questionState?.phase === 'question_open' ? 'not_submitted' : 'no_answer';
}

export function currentLeaderboard(session: RoomStateSession) {
  if (session.room.lifecycle_state === 'finished' || session.questionState?.phase === 'leaderboard') {
    return session.leaderboard;
  }

  return null;
}

export function buildHostAllowedActions(session: RoomStateSession): HostAllowedAction[] {
  if (session.room.lifecycle_state === 'lobby') {
    return ['start_game', 'abort_game'];
  }
  if (!session.questionState) {
    return [];
  }

  switch (session.questionState.phase) {
    case 'question_open':
      return ['close_question', 'abort_game'];
    case 'question_closed':
      return ['reveal', 'abort_game'];
    case 'reveal':
      return ['show_leaderboard', 'abort_game'];
    case 'leaderboard':
      return hasNextQuestion(session) ? ['next_question', 'abort_game'] : ['finish_game', 'abort_game'];
  }
}

function hasNextQuestion(session: RoomStateSession) {
  if (session.room.current_question_index === null) {
    return false;
  }

  return session.questionSnapshots.some((question) => question.question_index === session.room.current_question_index! + 1);
}