/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { InvalidOperationError } from '@/lib/server/service-errors';
import { createDemoAppService, demoAuthorActor } from '@/lib/server/demo-app-service';

describe('initial application flow smoke', () => {
  test('publishes a draft quiz and bootstraps a host room through the server boundary', async () => {
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:00:00.000Z'),
    });

    const draftQuiz = (await app.listQuizSummaries(demoAuthorActor)).find((quiz) => quiz.status === 'draft');

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
    expect(hostState.allowed_actions).toEqual(['start_game']);
    expect(hostState.shared_room.room_code).toBe(room.room_code);
  });

  test('joins, starts, submits, reveals, and shows the leaderboard through runtime logic', async () => {
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
    });

    const publishedQuiz = (await app.listQuizSummaries(demoAuthorActor)).find((quiz) => quiz.status === 'published');

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
});