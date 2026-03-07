import {
  answerSelectionSchema,
  answerSubmissionCommandSchema,
  answerSubmissionRecordSchema,
  playerReconnectCommandSchema,
  runtimeQuestionOptionSnapshotSchema,
  runtimeQuestionSnapshotSchema,
  runtimeQuestionStateSchema,
  runtimeRoomPlayerSchema,
  runtimeRoomSchema,
  type AnswerSubmissionCommand,
  type AnswerSubmissionRecord,
  type LeaderboardEntry,
  type PlayerReconnectCommand,
  type RuntimeQuestionOptionSnapshot,
  type RuntimeQuestionSnapshot,
  type RuntimeQuestionState,
  type RuntimeRoom,
  type RuntimeRoomPlayer,
} from '@/lib/shared/contracts';
import { InvalidOperationError } from '@/lib/server/service-errors';

const ACTIVE_ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const POST_GAME_TTL_MS = 30 * 60 * 1000;

export type AcceptedAnswerSubmission = Pick<AnswerSubmissionCommand, 'room_id' | 'question_index' | 'selected_option_ids'> & {
  room_player_id: string;
  accepted_at: string;
};

type RuntimeGameplayServiceDependencies = {
  clock?: () => Date;
};

export function createRuntimeGameplayService({ clock = () => new Date() }: RuntimeGameplayServiceDependencies = {}) {
  function joinPlayer(input: {
    room: RuntimeRoom;
    players: RuntimeRoomPlayer[];
    roomPlayerId: string;
    displayName: string;
    resumeTokenHash: string;
  }) {
    const room = runtimeRoomSchema.parse(input.room);
    const players = input.players.map((player) => runtimeRoomPlayerSchema.parse(player));
    const joinedAt = now(clock);
    assertRoomActive(room, joinedAt);
    if (room.lifecycle_state !== 'lobby') {
      throw new InvalidOperationError('Late join is rejected once gameplay is active');
    }

    return runtimeRoomPlayerSchema.parse({
      room_player_id: input.roomPlayerId,
      room_id: room.room_id,
      display_name: input.displayName,
      status: 'connected',
      resume_token_hash: input.resumeTokenHash,
      joined_at: joinedAt,
      last_seen_at: joinedAt,
      score_total: 0,
      correct_count: 0,
      join_order: nextJoinOrder(players),
    });
  }

  function reconnectPlayer(input: {
    room: RuntimeRoom;
    players: RuntimeRoomPlayer[];
    command: PlayerReconnectCommand;
    generateResumeToken: () => string;
    hashResumeToken: (token: string) => string;
  }) {
    const room = runtimeRoomSchema.parse(input.room);
    const players = input.players.map((player) => runtimeRoomPlayerSchema.parse(player));
    const command = playerReconnectCommandSchema.parse(input.command);
    const reconnectedAt = now(clock);

    assertReconnectableRoom(room, reconnectedAt);
    if (command.room_id !== room.room_id) {
      throw new InvalidOperationError('Reconnect must target the active room');
    }

    const player = players.find((entry) => entry.room_player_id === command.room_player_id);
    if (!player) {
      throw new InvalidOperationError('Reconnect requires a known room-scoped player');
    }
    if (input.hashResumeToken(command.resume_token) !== player.resume_token_hash) {
      throw new InvalidOperationError('Stale resume tokens are rejected');
    }

    const nextResumeToken = input.generateResumeToken();
    const updatedPlayer = runtimeRoomPlayerSchema.parse({
      ...player,
      resume_token_hash: input.hashResumeToken(nextResumeToken),
      last_seen_at: reconnectedAt,
      status: 'connected',
    });

    return {
      player: updatedPlayer,
      updatedPlayers: players.map((entry) => (entry.room_player_id === updatedPlayer.room_player_id ? updatedPlayer : entry)),
      resumeToken: nextResumeToken,
      resumeExpiresAt: room.expires_at,
    };
  }

  function startGame(input: { room: RuntimeRoom; questionSnapshots: RuntimeQuestionSnapshot[] }) {
    const room = runtimeRoomSchema.parse(input.room);
    const questionSnapshots = input.questionSnapshots.map((snapshot) => runtimeQuestionSnapshotSchema.parse(snapshot));
    const startedAt = now(clock);
    assertRoomActive(room, startedAt);
    if (room.lifecycle_state !== 'lobby') {
      throw new InvalidOperationError('Only lobby rooms can start gameplay');
    }

    const firstQuestion = questionSnapshots[0];
    if (!firstQuestion) {
      throw new InvalidOperationError('start_game requires at least one frozen question snapshot');
    }

    return {
      room: runtimeRoomSchema.parse({
        ...room,
        lifecycle_state: 'in_progress',
        current_question_index: firstQuestion.question_index,
        started_at: startedAt,
        ended_at: null,
        expires_at: addDuration(startedAt, ACTIVE_ROOM_TTL_MS),
      }),
      questionState: openQuestionState(firstQuestion, startedAt),
    };
  }

  function abortGame(input: { room: RuntimeRoom; endedAt?: string }) {
    const room = runtimeRoomSchema.parse(input.room);
    const endedAt = input.endedAt ?? now(clock);
    assertRoomActive(room, endedAt);
    if (room.lifecycle_state !== 'lobby' && room.lifecycle_state !== 'in_progress') {
      throw new InvalidOperationError('Only lobby or in-progress rooms can be aborted');
    }

    return runtimeRoomSchema.parse({
      ...room,
      lifecycle_state: 'aborted',
      ended_at: endedAt,
      expires_at: addDuration(endedAt, POST_GAME_TTL_MS),
    });
  }

  function closeQuestion(input: { room: RuntimeRoom; questionState: RuntimeQuestionState }) {
    const room = runtimeRoomSchema.parse(input.room);
    const questionState = runtimeQuestionStateSchema.parse(input.questionState);
    const closedAt = now(clock);
    assertQuestionTransition(room, questionState, 'question_open', closedAt);

    return runtimeQuestionStateSchema.parse({
      ...questionState,
      phase: 'question_closed',
      closed_at: closedAt,
    });
  }

  function revealQuestion(input: { room: RuntimeRoom; questionState: RuntimeQuestionState }) {
    const room = runtimeRoomSchema.parse(input.room);
    const questionState = runtimeQuestionStateSchema.parse(input.questionState);
    const revealedAt = now(clock);
    assertQuestionTransition(room, questionState, 'question_closed', revealedAt);

    return runtimeQuestionStateSchema.parse({
      ...questionState,
      phase: 'reveal',
      revealed_at: revealedAt,
    });
  }

  function showLeaderboard(input: { room: RuntimeRoom; questionState: RuntimeQuestionState }) {
    const room = runtimeRoomSchema.parse(input.room);
    const questionState = runtimeQuestionStateSchema.parse(input.questionState);
    const shownAt = now(clock);
    assertQuestionTransition(room, questionState, 'reveal', shownAt);

    return runtimeQuestionStateSchema.parse({
      ...questionState,
      phase: 'leaderboard',
      leaderboard_shown_at: shownAt,
    });
  }

  function advanceAfterLeaderboard(input: {
    room: RuntimeRoom;
    questionState: RuntimeQuestionState;
    questionSnapshots: RuntimeQuestionSnapshot[];
  }) {
    const room = runtimeRoomSchema.parse(input.room);
    const questionState = runtimeQuestionStateSchema.parse(input.questionState);
    const questionSnapshots = input.questionSnapshots.map((snapshot) => runtimeQuestionSnapshotSchema.parse(snapshot));
    const currentIndex = room.current_question_index;
    const transitionedAt = now(clock);
    assertQuestionTransition(room, questionState, 'leaderboard', transitionedAt);

    if (currentIndex === null) {
      throw new InvalidOperationError('Active gameplay requires a current question index');
    }

    const nextQuestion = questionSnapshots.find((snapshot) => snapshot.question_index === currentIndex + 1);
    if (!nextQuestion) {
      const endedAt = transitionedAt;
      return {
        room: runtimeRoomSchema.parse({
          ...room,
          lifecycle_state: 'finished',
          ended_at: endedAt,
          expires_at: addDuration(endedAt, POST_GAME_TTL_MS),
        }),
        questionState: null,
      };
    }

    const openedAt = transitionedAt;
    return {
      room: runtimeRoomSchema.parse({
        ...room,
        current_question_index: nextQuestion.question_index,
      }),
      questionState: openQuestionState(nextQuestion, openedAt),
    };
  }

  function acceptSubmission(input: {
    room: RuntimeRoom;
    questionState: RuntimeQuestionState;
    questionSnapshot: RuntimeQuestionSnapshot;
    optionSnapshots: RuntimeQuestionOptionSnapshot[];
    roomPlayerId: string;
    command: AnswerSubmissionCommand;
    existingAcceptedSubmissions: AcceptedAnswerSubmission[];
  }) {
    const room = runtimeRoomSchema.parse(input.room);
    const questionState = runtimeQuestionStateSchema.parse(input.questionState);
    const questionSnapshot = runtimeQuestionSnapshotSchema.parse(input.questionSnapshot);
    const optionSnapshots = input.optionSnapshots.map((option) => runtimeQuestionOptionSnapshotSchema.parse(option));
    const command = answerSubmissionCommandSchema.parse(input.command);
    const acceptedAt = now(clock);

    assertRoomActive(room, acceptedAt);
    assertCurrentQuestion(room, questionState, questionSnapshot, optionSnapshots, acceptedAt);
    if (questionState.phase !== 'question_open') {
      throw new InvalidOperationError('Submissions are only accepted while the question is open');
    }
    if (command.room_id !== room.room_id || command.question_index !== questionSnapshot.question_index) {
      throw new InvalidOperationError('Submission command must target the active room question');
    }
    if (questionState.deadline_at && Date.parse(acceptedAt) > Date.parse(questionState.deadline_at)) {
      throw new InvalidOperationError('Submissions after the server deadline are rejected');
    }
    if (
      input.existingAcceptedSubmissions.some(
        (submission) =>
          submission.room_player_id === input.roomPlayerId &&
          submission.room_id === room.room_id &&
          submission.question_index === questionSnapshot.question_index,
      )
    ) {
      throw new InvalidOperationError('Players may only have one accepted submission per question in the MVP');
    }

    assertKnownOptionIds(command.selected_option_ids, optionSnapshots);
    if (questionSnapshot.question_type === 'single_choice' && command.selected_option_ids.length !== 1) {
      throw new InvalidOperationError('single_choice submissions must contain exactly one option id');
    }

    return {
      acceptedSubmission: {
        room_id: room.room_id,
        question_index: questionSnapshot.question_index,
        room_player_id: input.roomPlayerId,
        accepted_at: acceptedAt,
        selected_option_ids: [...command.selected_option_ids],
      },
      answerSelections: command.selected_option_ids.map((sourceOptionId) =>
        answerSelectionSchema.parse({
          room_id: room.room_id,
          question_index: questionSnapshot.question_index,
          room_player_id: input.roomPlayerId,
          source_option_id: sourceOptionId,
        }),
      ),
    };
  }

  function finalizeQuestion(input: {
    room: RuntimeRoom;
    questionSnapshot: RuntimeQuestionSnapshot;
    optionSnapshots: RuntimeQuestionOptionSnapshot[];
    questionState: RuntimeQuestionState;
    players: RuntimeRoomPlayer[];
    acceptedSubmissions: AcceptedAnswerSubmission[];
  }) {
    const room = runtimeRoomSchema.parse(input.room);
    const questionSnapshot = runtimeQuestionSnapshotSchema.parse(input.questionSnapshot);
    const optionSnapshots = input.optionSnapshots.map((option) => runtimeQuestionOptionSnapshotSchema.parse(option));
    const questionState = runtimeQuestionStateSchema.parse(input.questionState);
    const players = input.players.map((player) => runtimeRoomPlayerSchema.parse(player));
    const finalizedAt = now(clock);

    assertCurrentQuestion(room, questionState, questionSnapshot, optionSnapshots, finalizedAt);
    if (questionState.phase === 'question_open') {
      throw new InvalidOperationError('Question scoring starts only after the question is closed');
    }

    const submissionsByPlayer = new Map<string, AnswerSubmissionRecord>();
    for (const submission of input.acceptedSubmissions) {
      assertAcceptedSubmission(submission, room, questionSnapshot, optionSnapshots);
      if (submissionsByPlayer.has(submission.room_player_id)) {
        throw new InvalidOperationError('Duplicate accepted submissions for the same player are not allowed');
      }

      const isCorrect = isExactMatch(submission.selected_option_ids, optionSnapshots);
      submissionsByPlayer.set(
        submission.room_player_id,
        answerSubmissionRecordSchema.parse({
          room_id: submission.room_id,
          question_index: submission.question_index,
          room_player_id: submission.room_player_id,
          accepted_at: submission.accepted_at,
          is_correct: isCorrect,
          awarded_points: calculateAwardedPoints({ room, questionSnapshot, questionState, acceptedAt: submission.accepted_at, isCorrect }),
          submission_status: 'accepted',
        }),
      );
    }

    const updatedPlayers = players.map((player) => {
      const record = submissionsByPlayer.get(player.room_player_id);
      if (!record) {
        return player;
      }

      return runtimeRoomPlayerSchema.parse({
        ...player,
        score_total: player.score_total + record.awarded_points,
        correct_count: player.correct_count + (record.is_correct ? 1 : 0),
      });
    });

    return {
      submissionRecords: players
        .map((player) => submissionsByPlayer.get(player.room_player_id))
        .filter((record): record is AnswerSubmissionRecord => record !== undefined),
      updatedPlayers,
      leaderboard: buildLeaderboard(updatedPlayers),
    };
  }

  return {
    joinPlayer,
    reconnectPlayer,
    startGame,
    abortGame,
    closeQuestion,
    revealQuestion,
    showLeaderboard,
    advanceAfterLeaderboard,
    acceptSubmission,
    finalizeQuestion,
  };
}

export function buildLeaderboard(players: RuntimeRoomPlayer[]): LeaderboardEntry[] {
  return [...players]
    .sort((left, right) => {
      if (right.score_total !== left.score_total) {
        return right.score_total - left.score_total;
      }
      if (right.correct_count !== left.correct_count) {
        return right.correct_count - left.correct_count;
      }
      return left.join_order - right.join_order;
    })
    .map((player, index) => ({
      room_player_id: player.room_player_id,
      display_name: player.display_name,
      score_total: player.score_total,
      correct_count: player.correct_count,
      rank: index + 1,
    }));
}

function openQuestionState(questionSnapshot: RuntimeQuestionSnapshot, openedAt: string) {
  return runtimeQuestionStateSchema.parse({
    room_id: questionSnapshot.room_id,
    question_index: questionSnapshot.question_index,
    phase: 'question_open',
    opened_at: openedAt,
    deadline_at:
      questionSnapshot.effective_time_limit_seconds === null
        ? null
        : addDuration(openedAt, questionSnapshot.effective_time_limit_seconds * 1000),
    closed_at: null,
    revealed_at: null,
    leaderboard_shown_at: null,
  });
}

function assertRoomActive(room: RuntimeRoom, nowIso: string) {
  if (Date.parse(nowIso) > Date.parse(room.expires_at) || room.lifecycle_state === 'expired') {
    throw new InvalidOperationError('Expired rooms reject gameplay actions');
  }
}

function assertReconnectableRoom(room: RuntimeRoom, nowIso: string) {
  assertRoomActive(room, nowIso);
}

function assertQuestionTransition(
  room: RuntimeRoom,
  questionState: RuntimeQuestionState,
  expectedPhase: RuntimeQuestionState['phase'],
  currentTime: string,
) {
  assertRoomActive(room, currentTime);
  if (room.lifecycle_state !== 'in_progress') {
    throw new InvalidOperationError('Question transitions are only valid while gameplay is in progress');
  }
  if (questionState.room_id !== room.room_id) {
    throw new InvalidOperationError('Question phase transitions must target the active room');
  }
  if (room.current_question_index !== questionState.question_index) {
    throw new InvalidOperationError('Question phase transitions must target the active question');
  }
  if (questionState.phase !== expectedPhase) {
    throw new InvalidOperationError(`Expected ${expectedPhase} before this transition`);
  }
}

function assertCurrentQuestion(
  room: RuntimeRoom,
  questionState: RuntimeQuestionState,
  questionSnapshot: RuntimeQuestionSnapshot,
  optionSnapshots: RuntimeQuestionOptionSnapshot[],
  currentTime: string,
) {
  assertRoomActive(room, currentTime);
  if (room.lifecycle_state !== 'in_progress') {
    throw new InvalidOperationError('Gameplay actions require an in-progress room');
  }
  if (
    questionState.room_id !== room.room_id ||
    questionSnapshot.room_id !== room.room_id ||
    room.current_question_index !== questionState.question_index ||
    room.current_question_index !== questionSnapshot.question_index ||
    optionSnapshots.some((option) => option.question_index !== questionSnapshot.question_index || option.room_id !== room.room_id)
  ) {
    throw new InvalidOperationError('Gameplay actions must target the active room question snapshot');
  }
}

function assertAcceptedSubmission(
  submission: AcceptedAnswerSubmission,
  room: RuntimeRoom,
  questionSnapshot: RuntimeQuestionSnapshot,
  optionSnapshots: RuntimeQuestionOptionSnapshot[],
) {
  if (submission.room_id !== room.room_id || submission.question_index !== questionSnapshot.question_index) {
    throw new InvalidOperationError('Accepted submissions must stay room- and question-scoped');
  }
  assertKnownOptionIds(submission.selected_option_ids, optionSnapshots);
}

function assertKnownOptionIds(selectedOptionIds: string[], optionSnapshots: RuntimeQuestionOptionSnapshot[]) {
  const knownIds = new Set(optionSnapshots.map((option) => option.source_option_id));
  for (const optionId of selectedOptionIds) {
    if (!knownIds.has(optionId)) {
      throw new InvalidOperationError('Submissions must reference stable option ids from the frozen room snapshot');
    }
  }
}

function isExactMatch(selectedOptionIds: string[], optionSnapshots: RuntimeQuestionOptionSnapshot[]) {
  const correctOptionIds = optionSnapshots.filter((option) => option.is_correct).map((option) => option.source_option_id).sort();
  const normalizedSelection = [...selectedOptionIds].sort();
  return (
    normalizedSelection.length === correctOptionIds.length &&
    normalizedSelection.every((optionId, index) => optionId === correctOptionIds[index])
  );
}

function calculateAwardedPoints(input: {
  room: RuntimeRoom;
  questionSnapshot: RuntimeQuestionSnapshot;
  questionState: RuntimeQuestionState;
  acceptedAt: string;
  isCorrect: boolean;
}) {
  if (!input.isCorrect) {
    return 0;
  }
  if (input.room.room_policy.scoring_mode === 'correctness_only') {
    return input.questionSnapshot.base_points;
  }
  if (input.questionSnapshot.effective_time_limit_seconds === null || input.questionState.deadline_at === null) {
    return input.questionSnapshot.base_points;
  }

  const openedAt = Date.parse(input.questionState.opened_at);
  const deadlineAt = Date.parse(input.questionState.deadline_at);
  const acceptedAt = Date.parse(input.acceptedAt);
  const duration = deadlineAt - openedAt;
  if (duration <= 0) {
    return input.questionSnapshot.base_points;
  }

  const elapsedRatio = clamp((acceptedAt - openedAt) / duration, 0, 1);
  return Math.floor(input.questionSnapshot.base_points * (1 - 0.5 * elapsedRatio));
}

function nextJoinOrder(players: RuntimeRoomPlayer[]) {
  return players.reduce((maxJoinOrder, player) => Math.max(maxJoinOrder, player.join_order), 0) + 1;
}

function addDuration(timestamp: string, milliseconds: number) {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function now(clock: () => Date) {
  return clock().toISOString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}