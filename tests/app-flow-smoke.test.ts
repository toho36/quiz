/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { InvalidOperationError } from '@/lib/server/service-errors';
import { createInMemoryAuthoringSpacetimeClientFactory } from '@/tests/support/in-memory-authoring-spacetime';
import { createInMemoryRuntimeBootstrapProvisioner } from '@/tests/support/in-memory-runtime-bootstrap';

const ORIGINAL_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;
const ORIGINAL_RUNTIME_BOOTSTRAP_SIGNING_KEY = process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY;

const authorActor = {
  clerkUserId: 'user-1',
  clerkSessionId: 'session-1',
};

async function loadAppServiceModule() {
  mock.module('server-only', () => ({}));
  return import('@/lib/server/app-service');
}

function decodeHostClaimPayload(token: string) {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_ENV = ORIGINAL_APP_ENV;
  process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = ORIGINAL_RUNTIME_BOOTSTRAP_SIGNING_KEY;
});

describe('initial application flow smoke', () => {
  test('publishes a draft quiz and bootstraps a host room through the server boundary', async () => {
    const { createAppService } = await loadAppServiceModule();
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = 'signing-key';

    const app = createAppService({
      authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(),
      runtimeProvisioner: createInMemoryRuntimeBootstrapProvisioner(),
      clock: () => new Date('2026-03-06T12:00:00.000Z'),
    });

    const draftQuiz = (await app.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'draft');

    expect(draftQuiz).toBeDefined();

    const saved = await app.saveQuizDetails({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
      title: 'Launch Readiness Quiz',
      description: 'Updated through the authoring flow.',
    });

    expect(saved.quiz.title).toBe('Launch Readiness Quiz');
    expect(saved.quiz.status).toBe('draft');

    const published = await app.publishQuiz({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
    });

    expect(published.quiz.status).toBe('published');

    const room = await app.createRoom({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
    });

    expect(room.host_claim_token.startsWith('demo-host-claim:')).toBe(false);
    expect(decodeHostClaimPayload(room.host_claim_token)).toMatchObject({
      purpose: 'host_claim',
      room_id: room.room_id,
      clerk_user_id: authorActor.clerkUserId,
      clerk_session_id: authorActor.clerkSessionId,
    });

    const hostState = app.getHostRoomState({
      actor: authorActor,
      roomCode: room.room_code,
    });

    expect(hostState.shared_room.lifecycle_state).toBe('lobby');
    expect(hostState.allowed_actions).toEqual(['start_game']);
    expect(hostState.shared_room.room_code).toBe(room.room_code);
  });

  test('joins, starts, submits, reveals, and shows the leaderboard through runtime logic', async () => {
    const { createAppService } = await loadAppServiceModule();
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = 'signing-key';

    const app = createAppService({
      authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(),
      runtimeProvisioner: createInMemoryRuntimeBootstrapProvisioner(),
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
    });

    const publishedQuiz = (await app.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: authorActor,
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
      actor: authorActor,
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
      actor: authorActor,
      roomCode: room.room_code,
      action: 'close_question',
    });
    app.performHostAction({
      actor: authorActor,
      roomCode: room.room_code,
      action: 'reveal',
    });

    playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
    });

    expect(playerState.self.latest_outcome).toEqual({ is_correct: true, awarded_points: 100 });

    app.performHostAction({
      actor: authorActor,
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