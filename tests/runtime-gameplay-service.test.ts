/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { createRuntimeGameplayService } from '@/lib/server/runtime-gameplay-service';
import { InvalidOperationError } from '@/lib/server/service-errors';
import type { AnswerSubmissionCommand, RuntimeRoom, RuntimeRoomPlayer } from '@/lib/shared/contracts';
import {
  answerSubmissionCommandFixture,
  runtimeQuestionOptionSnapshotFixture,
  runtimeQuestionSnapshotFixture,
  runtimeQuestionStateFixture,
  runtimeRoomFixture,
  runtimeRoomPlayerFixture,
} from '@/tests/fixtures/domain-contracts';

function createLobbyRoom() {
  return {
    ...runtimeRoomFixture,
    lifecycle_state: 'lobby' as const,
    current_question_index: null,
    started_at: null,
    ended_at: null,
    expires_at: '2026-03-07T10:00:00.000Z',
  } satisfies RuntimeRoom;
}

function createPlayer(overrides: Partial<RuntimeRoomPlayer> = {}): RuntimeRoomPlayer {
  return {
    ...runtimeRoomPlayerFixture,
    ...overrides,
  };
}

function createAnswerCommand(): AnswerSubmissionCommand {
  return {
    ...answerSubmissionCommandFixture,
    selected_option_ids: [...answerSubmissionCommandFixture.selected_option_ids],
  };
}

describe('runtime gameplay service', () => {
  test('enforces the documented question-phase order and only finishes after the final leaderboard', () => {
    const service = createRuntimeGameplayService({
      clock: () => new Date('2026-03-06T10:00:10.000Z'),
    });

    const room = createLobbyRoom();
    const questionSnapshots = [
      runtimeQuestionSnapshotFixture,
      {
        ...runtimeQuestionSnapshotFixture,
        question_index: 1,
        source_question_id: 'question-2',
        prompt: 'What is 3 + 3?',
        effective_time_limit_seconds: 15,
      },
    ];

    const started = service.startGame({ room, questionSnapshots });

    expect(started.room.lifecycle_state).toBe('in_progress');
    expect(started.room.current_question_index).toBe(0);
    expect(started.questionState.phase).toBe('question_open');
    expect(started.questionState.deadline_at).toBe('2026-03-06T10:00:30.000Z');

    expect(() =>
      service.showLeaderboard({
        room: started.room,
        questionState: started.questionState,
      }),
    ).toThrow(InvalidOperationError);

    const closed = service.closeQuestion({ room: started.room, questionState: started.questionState });
    const revealed = service.revealQuestion({ room: started.room, questionState: closed });
    const firstLeaderboard = service.showLeaderboard({ room: started.room, questionState: revealed });
    const nextQuestion = service.advanceAfterLeaderboard({
      room: started.room,
      questionState: firstLeaderboard,
      questionSnapshots,
    });

    expect(nextQuestion.room.lifecycle_state).toBe('in_progress');
    expect(nextQuestion.room.current_question_index).toBe(1);
    expect(nextQuestion.questionState?.phase).toBe('question_open');

    const secondClosed = service.closeQuestion({ room: nextQuestion.room, questionState: nextQuestion.questionState! });
    const secondRevealed = service.revealQuestion({ room: nextQuestion.room, questionState: secondClosed });
    const finalLeaderboard = service.showLeaderboard({ room: nextQuestion.room, questionState: secondRevealed });
    const finished = service.advanceAfterLeaderboard({
      room: nextQuestion.room,
      questionState: finalLeaderboard,
      questionSnapshots,
    });

    expect(finished.room.lifecycle_state).toBe('finished');
    expect(finished.room.ended_at).toBe('2026-03-06T10:00:10.000Z');
    expect(finished.room.expires_at).toBe('2026-03-06T10:30:10.000Z');
    expect(finished.questionState).toBeNull();
  });

  test('aborts lobby and in-progress rooms with the documented post-abort ttl', () => {
    const service = createRuntimeGameplayService({
      clock: () => new Date('2026-03-06T10:15:00.000Z'),
    });

    const abortedLobby = service.abortGame({ room: createLobbyRoom() });

    expect(abortedLobby.lifecycle_state).toBe('aborted');
    expect(abortedLobby.started_at).toBeNull();
    expect(abortedLobby.ended_at).toBe('2026-03-06T10:15:00.000Z');
    expect(abortedLobby.expires_at).toBe('2026-03-06T10:45:00.000Z');

    const abortedInProgress = service.abortGame({ room: runtimeRoomFixture });

    expect(abortedInProgress.lifecycle_state).toBe('aborted');
    expect(abortedInProgress.current_question_index).toBe(0);
    expect(abortedInProgress.ended_at).toBe('2026-03-06T10:15:00.000Z');
    expect(abortedInProgress.expires_at).toBe('2026-03-06T10:45:00.000Z');

    expect(() =>
      service.abortGame({
        room: {
          ...runtimeRoomFixture,
          lifecycle_state: 'finished',
          ended_at: '2026-03-06T10:10:00.000Z',
          expires_at: '2026-03-06T10:40:00.000Z',
        },
      }),
    ).toThrow(InvalidOperationError);
  });

  test('rejects late join attempts after gameplay has started', () => {
    const service = createRuntimeGameplayService({
      clock: () => new Date('2026-03-06T10:00:15.000Z'),
    });

    expect(() =>
      service.joinPlayer({
        room: runtimeRoomFixture,
        players: [runtimeRoomPlayerFixture],
        roomPlayerId: 'player-2',
        displayName: 'Late Player',
        resumeTokenHash: 'resume-hash-2',
      }),
    ).toThrow(InvalidOperationError);
  });

  test('rotates reconnect tokens, rejects replay, and only allows reconnect before expiry', () => {
    const service = createRuntimeGameplayService({
      clock: () => new Date('2026-03-06T10:00:25.000Z'),
    });
    const room = {
      ...runtimeRoomFixture,
      lifecycle_state: 'finished' as const,
      ended_at: '2026-03-06T10:00:20.000Z',
      expires_at: '2026-03-06T10:30:20.000Z',
    };
    const players = [createPlayer({ resume_token_hash: 'hash:resume-current' })];

    const reconnected = service.reconnectPlayer({
      room,
      players,
      command: {
        room_id: room.room_id,
        room_player_id: 'player-1',
        resume_token: 'resume-current',
      },
      generateResumeToken: () => 'resume-next',
      hashResumeToken: (token) => `hash:${token}`,
    });

    expect(reconnected.resumeToken).toBe('resume-next');
    expect(reconnected.resumeExpiresAt).toBe(room.expires_at);
    expect(reconnected.updatedPlayers[0]).toMatchObject({
      room_player_id: 'player-1',
      resume_token_hash: 'hash:resume-next',
      last_seen_at: '2026-03-06T10:00:25.000Z',
      status: 'connected',
    });

    expect(() =>
      service.reconnectPlayer({
        room,
        players: reconnected.updatedPlayers,
        command: {
          room_id: room.room_id,
          room_player_id: 'player-1',
          resume_token: 'resume-current',
        },
        generateResumeToken: () => 'resume-third',
        hashResumeToken: (token) => `hash:${token}`,
      }),
    ).toThrow(InvalidOperationError);

    const expiredService = createRuntimeGameplayService({
      clock: () => new Date('2026-03-06T10:30:20.001Z'),
    });

    expect(() =>
      expiredService.reconnectPlayer({
        room,
        players,
        command: {
          room_id: room.room_id,
          room_player_id: 'player-1',
          resume_token: 'resume-current',
        },
        generateResumeToken: () => 'resume-expired',
        hashResumeToken: (token) => `hash:${token}`,
      }),
    ).toThrow(InvalidOperationError);
  });

  test('allows reconnect for aborted rooms but rejects unknown players and wrong rooms', () => {
    const service = createRuntimeGameplayService({
      clock: () => new Date('2026-03-06T10:05:00.000Z'),
    });
    const room = {
      ...runtimeRoomFixture,
      lifecycle_state: 'aborted' as const,
      ended_at: '2026-03-06T10:04:00.000Z',
      expires_at: '2026-03-06T10:34:00.000Z',
    };

    expect(
      service.reconnectPlayer({
        room,
        players: [createPlayer({ resume_token_hash: 'hash:resume-aborted' })],
        command: {
          room_id: room.room_id,
          room_player_id: 'player-1',
          resume_token: 'resume-aborted',
        },
        generateResumeToken: () => 'resume-aborted-next',
        hashResumeToken: (token) => `hash:${token}`,
      }).updatedPlayers[0]?.resume_token_hash,
    ).toBe('hash:resume-aborted-next');

    expect(() =>
      service.reconnectPlayer({
        room,
        players: [createPlayer({ resume_token_hash: 'hash:resume-aborted' })],
        command: {
          room_id: 'room-2',
          room_player_id: 'player-1',
          resume_token: 'resume-aborted',
        },
        generateResumeToken: () => 'resume-room-mismatch',
        hashResumeToken: (token) => `hash:${token}`,
      }),
    ).toThrow(InvalidOperationError);

    expect(() =>
      service.reconnectPlayer({
        room,
        players: [createPlayer({ room_player_id: 'player-9', resume_token_hash: 'hash:resume-aborted' })],
        command: {
          room_id: room.room_id,
          room_player_id: 'player-1',
          resume_token: 'resume-aborted',
        },
        generateResumeToken: () => 'resume-unknown-player',
        hashResumeToken: (token) => `hash:${token}`,
      }),
    ).toThrow(InvalidOperationError);
  });

  test('rejects question phase transitions for a question state from another room', () => {
    const service = createRuntimeGameplayService({
      clock: () => new Date('2026-03-06T10:00:15.000Z'),
    });

    expect(() =>
      service.closeQuestion({
        room: runtimeRoomFixture,
        questionState: {
          ...runtimeQuestionStateFixture,
          room_id: 'room-2',
        },
      }),
    ).toThrow(InvalidOperationError);
  });

  test('accepts submissions exactly at the deadline and rejects late or duplicate submissions', () => {
    const optionSnapshots = [
      runtimeQuestionOptionSnapshotFixture,
      {
        ...runtimeQuestionOptionSnapshotFixture,
        source_option_id: 'option-2',
        author_position: 2,
        display_position: 1,
        text: '5',
        is_correct: false,
      },
    ];

    const onDeadlineService = createRuntimeGameplayService({
      clock: () => new Date('2026-03-06T10:00:30.000Z'),
    });

    const accepted = onDeadlineService.acceptSubmission({
      room: runtimeRoomFixture,
      questionState: runtimeQuestionStateFixture,
      questionSnapshot: runtimeQuestionSnapshotFixture,
      optionSnapshots,
      roomPlayerId: 'player-1',
      command: createAnswerCommand(),
      existingAcceptedSubmissions: [],
    });

    expect(accepted.acceptedSubmission.accepted_at).toBe('2026-03-06T10:00:30.000Z');
    expect(accepted.answerSelections).toEqual([
      {
        room_id: 'room-1',
        question_index: 0,
        room_player_id: 'player-1',
        source_option_id: 'option-1',
      },
    ]);

    expect(() =>
      onDeadlineService.acceptSubmission({
        room: runtimeRoomFixture,
        questionState: runtimeQuestionStateFixture,
        questionSnapshot: runtimeQuestionSnapshotFixture,
        optionSnapshots,
        roomPlayerId: 'player-1',
        command: createAnswerCommand(),
        existingAcceptedSubmissions: [accepted.acceptedSubmission],
      }),
    ).toThrow(InvalidOperationError);

    const lateService = createRuntimeGameplayService({
      clock: () => new Date('2026-03-06T10:00:30.001Z'),
    });

    expect(() =>
      lateService.acceptSubmission({
        room: runtimeRoomFixture,
        questionState: runtimeQuestionStateFixture,
        questionSnapshot: runtimeQuestionSnapshotFixture,
        optionSnapshots,
        roomPlayerId: 'player-1',
        command: createAnswerCommand(),
        existingAcceptedSubmissions: [],
      }),
    ).toThrow(InvalidOperationError);
  });

  test('finalizes exact-match speed-weighted scoring and orders the leaderboard deterministically', () => {
    const service = createRuntimeGameplayService({
      clock: () => new Date('2026-03-06T10:00:20.000Z'),
    });
    const room = {
      ...runtimeRoomFixture,
      room_policy: {
        ...runtimeRoomFixture.room_policy,
        scoring_mode: 'speed_weighted' as const,
      },
    };
    const questionSnapshot = {
      ...runtimeQuestionSnapshotFixture,
      question_type: 'multiple_choice' as const,
      base_points: 200,
      effective_time_limit_seconds: 20,
    };
    const optionSnapshots = [
      {
        ...runtimeQuestionOptionSnapshotFixture,
        source_option_id: 'option-3',
        is_correct: true,
      },
      {
        ...runtimeQuestionOptionSnapshotFixture,
        source_option_id: 'option-4',
        author_position: 2,
        display_position: 1,
        text: '3',
        is_correct: true,
      },
      {
        ...runtimeQuestionOptionSnapshotFixture,
        source_option_id: 'option-5',
        author_position: 3,
        display_position: 3,
        text: '4',
        is_correct: false,
      },
    ];
    const questionState = {
      ...runtimeQuestionStateFixture,
      deadline_at: '2026-03-06T10:00:20.000Z',
      closed_at: '2026-03-06T10:00:20.000Z',
      phase: 'question_closed' as const,
    };
    const players = [
      createPlayer({ room_player_id: 'player-1', display_name: 'Player One', score_total: 100, correct_count: 1, join_order: 2 }),
      createPlayer({ room_player_id: 'player-2', display_name: 'Player Two', score_total: 250, correct_count: 2, join_order: 1 }),
      createPlayer({ room_player_id: 'player-3', display_name: 'Player Three', score_total: 250, correct_count: 1, join_order: 3 }),
    ];

    const result = service.finalizeQuestion({
      room,
      questionSnapshot,
      optionSnapshots,
      questionState,
      players,
      acceptedSubmissions: [
        {
          room_id: 'room-1',
          question_index: 0,
          room_player_id: 'player-1',
          accepted_at: '2026-03-06T10:00:15.000Z',
          selected_option_ids: ['option-3', 'option-4'],
        },
        {
          room_id: 'room-1',
          question_index: 0,
          room_player_id: 'player-2',
          accepted_at: '2026-03-06T10:00:05.000Z',
          selected_option_ids: ['option-3'],
        },
      ],
    });

    expect(result.submissionRecords).toEqual([
      {
        room_id: 'room-1',
        question_index: 0,
        room_player_id: 'player-1',
        accepted_at: '2026-03-06T10:00:15.000Z',
        is_correct: true,
        awarded_points: 150,
        submission_status: 'accepted',
      },
      {
        room_id: 'room-1',
        question_index: 0,
        room_player_id: 'player-2',
        accepted_at: '2026-03-06T10:00:05.000Z',
        is_correct: false,
        awarded_points: 0,
        submission_status: 'accepted',
      },
    ]);

    expect(result.updatedPlayers).toEqual([
      createPlayer({ room_player_id: 'player-1', display_name: 'Player One', score_total: 250, correct_count: 2, join_order: 2 }),
      createPlayer({ room_player_id: 'player-2', display_name: 'Player Two', score_total: 250, correct_count: 2, join_order: 1 }),
      createPlayer({ room_player_id: 'player-3', display_name: 'Player Three', score_total: 250, correct_count: 1, join_order: 3 }),
    ]);
    expect(result.leaderboard).toEqual([
      { room_player_id: 'player-2', display_name: 'Player Two', score_total: 250, correct_count: 2, rank: 1 },
      { room_player_id: 'player-1', display_name: 'Player One', score_total: 250, correct_count: 2, rank: 2 },
      { room_player_id: 'player-3', display_name: 'Player Three', score_total: 250, correct_count: 1, rank: 3 },
    ]);
  });

  test('uses correctness-only scoring as full base points for exact matches', () => {
    const service = createRuntimeGameplayService({
      clock: () => new Date('2026-03-06T10:00:20.000Z'),
    });
    const room = {
      ...runtimeRoomFixture,
      room_policy: {
        ...runtimeRoomFixture.room_policy,
        scoring_mode: 'correctness_only' as const,
      },
    };

    const result = service.finalizeQuestion({
      room,
      questionSnapshot: {
        ...runtimeQuestionSnapshotFixture,
        question_type: 'multiple_choice' as const,
        base_points: 200,
        effective_time_limit_seconds: null,
      },
      optionSnapshots: [
        { ...runtimeQuestionOptionSnapshotFixture, source_option_id: 'option-3', is_correct: true },
        {
          ...runtimeQuestionOptionSnapshotFixture,
          source_option_id: 'option-4',
          author_position: 2,
          display_position: 1,
          text: '3',
          is_correct: true,
        },
        {
          ...runtimeQuestionOptionSnapshotFixture,
          source_option_id: 'option-5',
          author_position: 3,
          display_position: 3,
          text: '4',
          is_correct: false,
        },
      ],
      questionState: {
        ...runtimeQuestionStateFixture,
        phase: 'question_closed' as const,
        closed_at: '2026-03-06T10:00:20.000Z',
      },
      players: [createPlayer({ score_total: 0, correct_count: 0 })],
      acceptedSubmissions: [
        {
          room_id: 'room-1',
          question_index: 0,
          room_player_id: 'player-1',
          accepted_at: '2026-03-06T10:00:19.000Z',
          selected_option_ids: ['option-3', 'option-4'],
        },
      ],
    });

    expect(result.submissionRecords[0]?.awarded_points).toBe(200);
    expect(result.updatedPlayers[0]?.score_total).toBe(200);
    expect(result.updatedPlayers[0]?.correct_count).toBe(1);
  });

  test('rejects finalizing question scoring after the room has expired', () => {
    const service = createRuntimeGameplayService({
      clock: () => new Date('2026-03-06T10:00:31.000Z'),
    });

    expect(() =>
      service.finalizeQuestion({
        room: {
          ...runtimeRoomFixture,
          expires_at: '2026-03-06T10:00:30.000Z',
        },
        questionSnapshot: runtimeQuestionSnapshotFixture,
        optionSnapshots: [runtimeQuestionOptionSnapshotFixture],
        questionState: {
          ...runtimeQuestionStateFixture,
          phase: 'question_closed' as const,
          closed_at: '2026-03-06T10:00:20.000Z',
        },
        players: [createPlayer({ score_total: 0, correct_count: 0 })],
        acceptedSubmissions: [],
      }),
    ).toThrow(InvalidOperationError);
  });
});