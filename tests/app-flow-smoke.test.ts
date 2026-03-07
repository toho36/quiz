/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { AuthorizationError, InvalidOperationError } from '@/lib/server/service-errors';
import { createDemoAppService, demoAuthorActor } from '@/lib/server/demo-app-service';

describe('initial application flow smoke', () => {
  test('keeps lobby rooms joinable for the documented pre-start window', async () => {
    let currentTime = new Date('2026-03-06T12:00:00.000Z');
    const app = createDemoAppService({
      clock: () => currentTime,
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    currentTime = new Date('2026-03-06T15:00:00.000Z');

    await app.joinRoom({
      guestSessionId: 'guest-late-lobby',
      roomCode: room.room_code,
      displayName: 'Patient Player',
    });

    const playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-late-lobby',
      roomCode: room.room_code,
    });

    expect(playerState.shared_room.lifecycle_state).toBe('lobby');
    expect(playerState.self.display_name).toBe('Patient Player');
  });

  test('freezes the latest published quiz content when gameplay starts', async () => {
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    const currentDocument = await app.loadQuizDocument({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    await app.saveQuizDocument({
      actor: demoAuthorActor,
      document: {
        ...currentDocument,
        questions: currentDocument.questions.map((entry, index) =>
          index === 0
            ? {
                ...entry,
                question: {
                  ...entry.question,
                  prompt: 'What is 2 + 3?',
                },
                options: entry.options.map((option) =>
                  option.option_id === 'option-1'
                    ? {
                        ...option,
                        text: '5',
                      }
                    : option,
                ),
              }
            : entry,
        ),
      },
    });

    const hostState = app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'start_game',
    });

    expect(hostState.active_question?.prompt).toBe('What is 2 + 3?');
    expect(hostState.active_question?.display_options.map((option) => option.text)).toContain('5');
  });

  test('publishes a draft quiz and bootstraps a host room through the server boundary', async () => {
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:00:00.000Z'),
    });

    const draftQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'draft');

    expect(draftQuiz).toBeDefined();

    const saved = await app.saveQuizDetails({
      actor: demoAuthorActor,
      quizId: draftQuiz!.quiz_id,
      title: 'Launch Readiness Quiz',
      description: 'Updated through the authoring flow.',
    });

    expect(saved.quiz.title).toBe('Launch Readiness Quiz');
    expect(saved.quiz.status).toBe('draft');

    const published = await app.publishQuiz({
      actor: demoAuthorActor,
      quizId: draftQuiz!.quiz_id,
    });

    expect(published.quiz.status).toBe('published');

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: draftQuiz!.quiz_id,
    });

    const hostState = app.getHostRoomState({
      actor: demoAuthorActor,
      roomCode: room.room_code,
    });

    expect(hostState.shared_room.lifecycle_state).toBe('lobby');
    expect(hostState.allowed_actions).toEqual(['start_game', 'abort_game']);
    expect(hostState.shared_room.room_code).toBe(room.room_code);
  });

  test('joins, starts, submits, reveals, and shows the leaderboard through runtime logic', async () => {
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    await app.joinRoom({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
      displayName: 'Player One',
    });

    let playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
    });

    expect(playerState.shared_room.lifecycle_state).toBe('lobby');
    expect(playerState.self.display_name).toBe('Player One');

    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'start_game',
    });

    playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
    });

    expect(playerState.shared_room.lifecycle_state).toBe('in_progress');
    expect(playerState.active_question?.prompt).toContain('2 + 2');

    await app.submitAnswer({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
      selectedOptionIds: ['option-1'],
    });

    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'close_question',
    });
    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'reveal',
    });

    playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
    });

    expect(playerState.self.latest_outcome).toEqual({ is_correct: true, awarded_points: 100 });

    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'show_leaderboard',
    });

    playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
    });

    expect(playerState.leaderboard?.[0]).toMatchObject({
      display_name: 'Player One',
      score_total: 100,
      rank: 1,
    });

    expect(() =>
      app.joinRoom({
        guestSessionId: 'guest-2',
        roomCode: room.room_code,
        displayName: 'Late Player',
      }),
    ).toThrow(InvalidOperationError);
  });

  test('rotates reconnect tokens, rebinds authority, and rejects stale replay attempts', async () => {
    let currentTime = new Date('2026-03-06T12:05:00.000Z');
    const app = createDemoAppService({
      clock: () => currentTime,
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    const joined = app.joinRoom({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
      displayName: 'Player One',
    });

    expect(joined.roomId).toBe(room.room_id);
    expect(joined.resumeToken.length).toBeGreaterThan(20);
    expect(joined.resumeExpiresAt).toBe('2026-03-07T00:05:00.000Z');

    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'start_game',
    });

    currentTime = new Date('2026-03-06T12:05:10.000Z');

    const reconnected = app.reconnectPlayer({
      guestSessionId: 'guest-2',
      roomId: room.room_id,
      roomPlayerId: joined.roomPlayerId,
      resumeToken: joined.resumeToken,
    });

    expect(reconnected.roomCode).toBe(room.room_code);
    expect(reconnected.roomPlayerId).toBe(joined.roomPlayerId);
    expect(reconnected.resumeVersion).toBe(2);
    expect(reconnected.resumeToken).not.toBe(joined.resumeToken);
    expect(reconnected.resumeExpiresAt).toBe('2026-03-06T14:05:00.000Z');

    expect(app.findPlayerRoomState({ guestSessionId: 'guest-1', roomCode: room.room_code })).toBeNull();
    expect(() =>
      app.submitAnswer({
        guestSessionId: 'guest-1',
        roomCode: room.room_code,
        selectedOptionIds: ['option-1'],
      }),
    ).toThrow(AuthorizationError);

    const accepted = app.submitAnswer({
      guestSessionId: 'guest-2',
      roomCode: room.room_code,
      selectedOptionIds: ['option-1'],
    });

    expect(accepted.room_player_id).toBe(joined.roomPlayerId);

    let replayError: unknown;
    try {
      app.reconnectPlayer({
        guestSessionId: 'guest-3',
        roomId: room.room_id,
        roomPlayerId: joined.roomPlayerId,
        resumeToken: joined.resumeToken,
      });
    } catch (error) {
      replayError = error;
    }

    expect(replayError).toBeInstanceOf(InvalidOperationError);
    expect((replayError as Error).message).toBe('stale_resume_token');
  });

  test('allows hosts to abort from lobby or gameplay and leaves the room read-only', async () => {
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const lobbyRoom = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    expect(app.getHostRoomState({ actor: demoAuthorActor, roomCode: lobbyRoom.room_code }).allowed_actions).toEqual([
      'start_game',
      'abort_game',
    ]);

    const abortedLobby = app.performHostAction({
      actor: demoAuthorActor,
      roomCode: lobbyRoom.room_code,
      action: 'abort_game',
    });

    expect(abortedLobby.shared_room.lifecycle_state).toBe('aborted');
    expect(abortedLobby.shared_room.question_index).toBeNull();
    expect(abortedLobby.shared_room.question_phase).toBeNull();
    expect(abortedLobby.allowed_actions).toEqual([]);

    const activeRoom = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    await app.joinRoom({
      guestSessionId: 'guest-abort',
      roomCode: activeRoom.room_code,
      displayName: 'Player Abort',
    });

    const started = app.performHostAction({
      actor: demoAuthorActor,
      roomCode: activeRoom.room_code,
      action: 'start_game',
    });

    expect(started.allowed_actions).toEqual(['close_question', 'abort_game']);

    const abortedActive = app.performHostAction({
      actor: demoAuthorActor,
      roomCode: activeRoom.room_code,
      action: 'abort_game',
    });

    expect(abortedActive.shared_room.lifecycle_state).toBe('aborted');
    expect(abortedActive.shared_room.question_index).toBeNull();
    expect(abortedActive.shared_room.question_phase).toBeNull();
    expect(abortedActive.active_question).toBeNull();
    expect(abortedActive.allowed_actions).toEqual([]);
    expect(abortedActive.leaderboard).toBeNull();

    const playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-abort',
      roomCode: activeRoom.room_code,
    });

    expect(playerState.shared_room.lifecycle_state).toBe('aborted');
    expect(playerState.shared_room.question_index).toBeNull();
    expect(playerState.shared_room.question_phase).toBeNull();
    expect(playerState.active_question).toBeNull();
    expect(playerState.leaderboard).toBeNull();

    expect(() =>
      app.submitAnswer({
        guestSessionId: 'guest-abort',
        roomCode: activeRoom.room_code,
        selectedOptionIds: ['option-1'],
      }),
    ).toThrow(InvalidOperationError);
  });

  test('stops returning host and player room state after an aborted room passes its post-game expiry', async () => {
    let currentTime = new Date('2026-03-06T12:05:00.000Z');
    const app = createDemoAppService({
      clock: () => currentTime,
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    await app.joinRoom({
      guestSessionId: 'guest-abort-expiry',
      roomCode: room.room_code,
      displayName: 'Expired Player',
    });

    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'start_game',
    });
    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'abort_game',
    });

    currentTime = new Date('2026-03-06T12:36:00.000Z');

    expect(() =>
      app.getHostRoomState({
        actor: demoAuthorActor,
        roomCode: room.room_code,
      }),
    ).toThrow(InvalidOperationError);

    expect(() =>
      app.getPlayerRoomState({
        guestSessionId: 'guest-abort-expiry',
        roomCode: room.room_code,
      }),
    ).toThrow(InvalidOperationError);
  });
});