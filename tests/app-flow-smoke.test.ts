/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { AuthorizationError, InvalidOperationError } from '@/lib/server/service-errors';
import { createInMemoryAuthoringSpacetimeClientFactory } from '@/tests/support/in-memory-authoring-spacetime';
import { createInMemoryRuntimeBootstrapProvisioner } from '@/tests/support/in-memory-runtime-bootstrap';

const ORIGINAL_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;
const ORIGINAL_RUNTIME_BOOTSTRAP_SIGNING_KEY = process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY;
const ORIGINAL_CONSOLE_INFO = console.info;

const authorActor = {
  clerkUserId: 'user-1',
  clerkSessionId: 'session-1',
};

const hostTransportSessionId = 'host-session-1';

async function loadAppServiceModule() {
  mock.module('server-only', () => ({}));
  mock.module('spacetimedb', () => {
    class MockDbConnectionImpl {}
    class MockDbConnectionBuilder {
      withUri() { return this; }
      withDatabaseName() { return this; }
      withToken() { return this; }
      onConnect() { return this; }
      onConnectError() { return this; }
      onDisconnect() { return this; }
      build() { return {}; }
    }
    const t = {
      string: () => ({}),
      u32: () => ({}),
      bool: () => ({}),
      option: (_value: unknown) => ({}),
      array: (_value: unknown) => ({}),
      object: (_name: string, shape: unknown) => ({ shape }),
    };
    return {
      DbConnectionBuilder: MockDbConnectionBuilder,
      DbConnectionImpl: MockDbConnectionImpl,
      procedureSchema: (name: string, args: unknown, returns: unknown) => ({ name, args, returns }),
      procedures: (...definitions: Array<{ name: string }>) =>
        Object.fromEntries(definitions.map((definition) => [definition.name, definition])),
      reducers: () => ({ reducersType: { reducers: {} } }),
      schema: () => ({ schemaType: { tables: {} } }),
      t,
    };
  });
  return import('@/lib/server/app-service');
}

function decodeHostClaimPayload(token: string) {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_ENV = ORIGINAL_APP_ENV;
  process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = ORIGINAL_RUNTIME_BOOTSTRAP_SIGNING_KEY;
  console.info = ORIGINAL_CONSOLE_INFO;
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

    app.claimHost({
      actor: authorActor,
      roomCode: room.room_code,
      hostClaimToken: room.host_claim_token,
      transportSessionId: hostTransportSessionId,
    });

    const hostState = app.getHostRoomState({
      actor: authorActor,
      roomCode: room.room_code,
      transportSessionId: hostTransportSessionId,
    });

    const binding = app.joinRoom({
      guestSessionId: 'guest-bootstrap',
      roomCode: room.room_code,
      displayName: 'Player Bootstrap',
    });

    expect(hostState.shared_room.lifecycle_state).toBe('lobby');
    expect(hostState.allowed_actions).toEqual(['start_game', 'abort_game']);
    expect(hostState.shared_room.room_code).toBe(room.room_code);
    expect(binding.resumeExpiresAt).toBe('2026-03-07T12:00:00.000Z');
  });

  test('supports question and option authoring flows before publishing a draft quiz', async () => {
    const { createAppService } = await loadAppServiceModule();
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = 'signing-key';

    const app = createAppService({
      authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(),
      runtimeProvisioner: createInMemoryRuntimeBootstrapProvisioner(),
      clock: () => new Date('2026-03-06T12:02:00.000Z'),
    });

    const draftQuiz = (await app.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'draft');

    expect(draftQuiz).toBeDefined();

    const withAddedQuestion = await app.addQuestion({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
    });
    const createdQuestion = withAddedQuestion.questions.at(-1);

    expect(createdQuestion).toBeDefined();
    expect(withAddedQuestion.questions).toHaveLength(3);

    const withSavedCreatedQuestion = await app.saveQuestion({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
      questionId: createdQuestion!.question.question_id,
      prompt: 'Final launch readiness?',
      questionType: 'single_choice',
      basePoints: 150,
      timeLimitSeconds: 45,
      shuffleAnswers: false,
      options: [
        { optionId: createdQuestion!.options[0]!.option_id, text: 'Go live', isCorrect: true },
        { optionId: createdQuestion!.options[1]!.option_id, text: 'Hold release', isCorrect: false },
      ],
    });

    expect(
      withSavedCreatedQuestion.questions.find((entry) => entry.question.question_id === createdQuestion!.question.question_id),
    ).toMatchObject({
      question: {
        prompt: 'Final launch readiness?',
        base_points: 150,
        time_limit_seconds: 45,
        shuffle_answers: false,
      },
    });

    const withMovedQuestionUp = await app.moveQuestion({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
      questionId: createdQuestion!.question.question_id,
      direction: 'up',
    });
    const withMovedQuestionToFront = await app.moveQuestion({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
      questionId: createdQuestion!.question.question_id,
      direction: 'up',
    });

    expect(withMovedQuestionUp.questions).toHaveLength(3);
    expect(withMovedQuestionToFront.questions[0]?.question.question_id).toBe(createdQuestion!.question.question_id);

    const withAddedOption = await app.addOption({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
      questionId: 'draft-question-1',
    });
    const editableQuestion = withAddedOption.questions.find((entry) => entry.question.question_id === 'draft-question-1');
    const createdOption = editableQuestion?.options.at(-1);

    expect(editableQuestion?.options).toHaveLength(3);
    expect(createdOption).toBeDefined();

    const withSavedExistingQuestion = await app.saveQuestion({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
      questionId: 'draft-question-1',
      prompt: 'What equals 2 + 2?',
      questionType: 'single_choice',
      basePoints: 120,
      timeLimitSeconds: 25,
      shuffleAnswers: true,
      options: [
        { optionId: editableQuestion!.options[0]!.option_id, text: '4', isCorrect: true },
        { optionId: editableQuestion!.options[1]!.option_id, text: '5', isCorrect: false },
        { optionId: createdOption!.option_id, text: '22', isCorrect: false },
      ],
    });

    expect(
      withSavedExistingQuestion.questions.find((entry) => entry.question.question_id === 'draft-question-1'),
    ).toMatchObject({
      question: {
        prompt: 'What equals 2 + 2?',
        base_points: 120,
        time_limit_seconds: 25,
        shuffle_answers: true,
      },
      options: [
        { text: '4', is_correct: true },
        { text: '5', is_correct: false },
        { text: '22', is_correct: false },
      ],
    });

    const withMovedOption = await app.moveOption({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
      questionId: 'draft-question-1',
      optionId: createdOption!.option_id,
      direction: 'up',
    });
    const movedQuestion = withMovedOption.questions.find((entry) => entry.question.question_id === 'draft-question-1');

    expect(movedQuestion?.options[1]?.option_id).toBe(createdOption!.option_id);

    const withDeletedOption = await app.deleteOption({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
      questionId: 'draft-question-1',
      optionId: createdOption!.option_id,
    });

    expect(withDeletedOption.questions.find((entry) => entry.question.question_id === 'draft-question-1')?.options).toHaveLength(2);

    const withDeletedQuestion = await app.deleteQuestion({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
      questionId: 'draft-question-2',
    });

    expect(withDeletedQuestion.questions.map((entry) => entry.question.question_id)).not.toContain('draft-question-2');
    expect(withDeletedQuestion.questions).toHaveLength(2);

    const published = await app.publishQuiz({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
    });

    expect(published.quiz.status).toBe('published');
    expect(published.questions[0]?.question.question_id).toBe(createdQuestion!.question.question_id);

    const room = await app.createRoom({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
    });

    expect(room.source_quiz_id).toBe(draftQuiz!.quiz_id);
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

    app.claimHost({
      actor: authorActor,
      roomCode: room.room_code,
      hostClaimToken: room.host_claim_token,
      transportSessionId: hostTransportSessionId,
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
      transportSessionId: hostTransportSessionId,
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
      transportSessionId: hostTransportSessionId,
    });
    app.performHostAction({
      actor: authorActor,
      roomCode: room.room_code,
      action: 'reveal',
      transportSessionId: hostTransportSessionId,
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
      transportSessionId: hostTransportSessionId,
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

  test('aborts an in-progress room, keeps it read-only until expiry, and then marks it expired', async () => {
    const { createAppService } = await loadAppServiceModule();
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = 'signing-key';
    const consoleInfoMock = mock(() => {});
    console.info = consoleInfoMock as typeof console.info;

    let now = new Date('2026-03-06T12:20:00.000Z');
    const app = createAppService({
      authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(),
      runtimeProvisioner: createInMemoryRuntimeBootstrapProvisioner(undefined, { clock: () => now }),
      clock: () => now,
    });

    const publishedQuiz = (await app.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'published');
    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: authorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    app.claimHost({
      actor: authorActor,
      roomCode: room.room_code,
      hostClaimToken: room.host_claim_token,
      transportSessionId: hostTransportSessionId,
    });

    const initialBinding = app.joinRoom({
      guestSessionId: 'guest-abort-1',
      roomCode: room.room_code,
      displayName: 'Abort Player',
    });

    expect(initialBinding.resumeExpiresAt).toBe('2026-03-07T12:20:00.000Z');
    expect(app.getHostRoomState({ actor: authorActor, roomCode: room.room_code, transportSessionId: hostTransportSessionId }).allowed_actions).toEqual([
      'start_game',
      'abort_game',
    ]);

    app.performHostAction({ actor: authorActor, roomCode: room.room_code, action: 'start_game', transportSessionId: hostTransportSessionId });

    expect(app.getHostRoomState({ actor: authorActor, roomCode: room.room_code, transportSessionId: hostTransportSessionId }).allowed_actions).toEqual([
      'close_question',
      'abort_game',
    ]);

    let currentBinding = app.reconnectPlayer({
      guestSessionId: 'guest-abort-2',
      roomCode: room.room_code,
      roomId: room.room_id,
      roomPlayerId: initialBinding.roomPlayerId,
      resumeToken: initialBinding.resumeToken,
    });

    expect(currentBinding.resumeExpiresAt).toBe('2026-03-06T14:20:00.000Z');

    const abortedHostState = app.performHostAction({
      actor: authorActor,
      roomCode: room.room_code,
      action: 'abort_game',
      transportSessionId: hostTransportSessionId,
    });

    expect(abortedHostState.shared_room.lifecycle_state).toBe('aborted');
    expect(abortedHostState.shared_room.question_phase).toBeNull();
    expect(abortedHostState.allowed_actions).toEqual([]);

    let playerState = app.getPlayerRoomState({ guestSessionId: 'guest-abort-2', roomCode: room.room_code });
    expect(playerState.shared_room.lifecycle_state).toBe('aborted');
    expect(playerState.shared_room.question_phase).toBeNull();
    expect(playerState.active_question).toBeNull();
    expect(playerState.leaderboard).toBeNull();

    expect(() =>
      app.submitAnswer({
        guestSessionId: 'guest-abort-2',
        roomCode: room.room_code,
        selectedOptionIds: ['option-1'],
      }),
    ).toThrow(InvalidOperationError);

    currentBinding = app.reconnectPlayer({
      guestSessionId: 'guest-abort-3',
      roomCode: room.room_code,
      roomId: room.room_id,
      roomPlayerId: currentBinding.roomPlayerId,
      resumeToken: currentBinding.resumeToken,
    });

    expect(currentBinding.resumeExpiresAt).toBe('2026-03-06T12:50:00.000Z');
    playerState = app.getPlayerRoomState({ guestSessionId: 'guest-abort-3', roomCode: room.room_code });
    expect(playerState.shared_room.lifecycle_state).toBe('aborted');

    now = new Date('2026-03-06T12:50:00.001Z');

    expect(app.getHostRoomState({ actor: authorActor, roomCode: room.room_code, transportSessionId: hostTransportSessionId }).shared_room.lifecycle_state).toBe(
      'expired',
    );

    playerState = app.getPlayerRoomState({ guestSessionId: 'guest-abort-3', roomCode: room.room_code });
    expect(playerState.shared_room.lifecycle_state).toBe('expired');
    expect(playerState.active_question).toBeNull();
    expect(playerState.leaderboard).toBeNull();

    expect(() =>
      app.reconnectPlayer({
        guestSessionId: 'guest-abort-expired',
        roomCode: room.room_code,
        roomId: room.room_id,
        roomPlayerId: currentBinding.roomPlayerId,
        resumeToken: currentBinding.resumeToken,
      }),
    ).toThrow(InvalidOperationError);

    const loggedEntries = (consoleInfoMock.mock.calls as unknown[][]).map((call) => JSON.parse(String(call[0] ?? '')));
    expect(loggedEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'runtime.lifecycle_transition',
          environment: 'local',
          deploymentId: null,
          metadata: expect.objectContaining({
            roomId: room.room_id,
            roomCode: room.room_code,
            action: 'abort_game',
            previousLifecycleState: 'in_progress',
            resultingLifecycleState: 'aborted',
            resultingQuestionPhase: null,
          }),
        }),
      ]),
    );
  });

  test('reconnects through lobby, question phases, and finished state while replacing the previous session', async () => {
    const { createAppService } = await loadAppServiceModule();
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = 'signing-key';
    const consoleInfoMock = mock(() => {});
    console.info = consoleInfoMock as typeof console.info;

    let now = new Date('2026-03-06T12:10:00.000Z');
    const app = createAppService({
      authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(),
      runtimeProvisioner: createInMemoryRuntimeBootstrapProvisioner(undefined, { clock: () => now }),
      clock: () => now,
    });

    const publishedQuiz = (await app.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'published');
    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: authorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    app.claimHost({
      actor: authorActor,
      roomCode: room.room_code,
      hostClaimToken: room.host_claim_token,
      transportSessionId: hostTransportSessionId,
    });

    const initialBinding = app.joinRoom({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
      displayName: 'Reconnect Player',
    });

    let currentBinding = app.reconnectPlayer({
      guestSessionId: 'guest-2',
      roomCode: room.room_code,
      roomId: room.room_id,
      roomPlayerId: initialBinding.roomPlayerId,
      resumeToken: initialBinding.resumeToken,
    });

    expect(currentBinding.resumeToken).not.toBe(initialBinding.resumeToken);
    expect(app.findPlayerRoomState({ guestSessionId: 'guest-1', roomCode: room.room_code })).toBeNull();

    let playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-2',
      roomCode: room.room_code,
    });

    expect(playerState.shared_room.lifecycle_state).toBe('lobby');
    expect(playerState.shared_room.question_phase).toBeNull();

    app.performHostAction({
      actor: authorActor,
      roomCode: room.room_code,
      action: 'start_game',
      transportSessionId: hostTransportSessionId,
    });

    currentBinding = app.reconnectPlayer({
      guestSessionId: 'guest-3',
      roomCode: room.room_code,
      roomId: room.room_id,
      roomPlayerId: currentBinding.roomPlayerId,
      resumeToken: currentBinding.resumeToken,
    });
    playerState = app.getPlayerRoomState({ guestSessionId: 'guest-3', roomCode: room.room_code });
    expect(playerState.shared_room.question_phase).toBe('question_open');

    expect(() =>
      app.submitAnswer({
        guestSessionId: 'guest-2',
        roomCode: room.room_code,
        selectedOptionIds: ['option-1'],
      }),
    ).toThrow(AuthorizationError);

    app.performHostAction({ actor: authorActor, roomCode: room.room_code, action: 'close_question', transportSessionId: hostTransportSessionId });
    currentBinding = app.reconnectPlayer({
      guestSessionId: 'guest-4',
      roomCode: room.room_code,
      roomId: room.room_id,
      roomPlayerId: currentBinding.roomPlayerId,
      resumeToken: currentBinding.resumeToken,
    });
    playerState = app.getPlayerRoomState({ guestSessionId: 'guest-4', roomCode: room.room_code });
    expect(playerState.shared_room.question_phase).toBe('question_closed');

    app.performHostAction({ actor: authorActor, roomCode: room.room_code, action: 'reveal', transportSessionId: hostTransportSessionId });
    currentBinding = app.reconnectPlayer({
      guestSessionId: 'guest-5',
      roomCode: room.room_code,
      roomId: room.room_id,
      roomPlayerId: currentBinding.roomPlayerId,
      resumeToken: currentBinding.resumeToken,
    });
    playerState = app.getPlayerRoomState({ guestSessionId: 'guest-5', roomCode: room.room_code });
    expect(playerState.shared_room.question_phase).toBe('reveal');

    app.performHostAction({ actor: authorActor, roomCode: room.room_code, action: 'show_leaderboard', transportSessionId: hostTransportSessionId });
    currentBinding = app.reconnectPlayer({
      guestSessionId: 'guest-6',
      roomCode: room.room_code,
      roomId: room.room_id,
      roomPlayerId: currentBinding.roomPlayerId,
      resumeToken: currentBinding.resumeToken,
    });
    playerState = app.getPlayerRoomState({ guestSessionId: 'guest-6', roomCode: room.room_code });
    expect(playerState.shared_room.question_phase).toBe('leaderboard');

    app.performHostAction({ actor: authorActor, roomCode: room.room_code, action: 'next_question', transportSessionId: hostTransportSessionId });
    app.performHostAction({ actor: authorActor, roomCode: room.room_code, action: 'close_question', transportSessionId: hostTransportSessionId });
    app.performHostAction({ actor: authorActor, roomCode: room.room_code, action: 'reveal', transportSessionId: hostTransportSessionId });
    app.performHostAction({ actor: authorActor, roomCode: room.room_code, action: 'show_leaderboard', transportSessionId: hostTransportSessionId });
    app.performHostAction({ actor: authorActor, roomCode: room.room_code, action: 'finish_game', transportSessionId: hostTransportSessionId });

    currentBinding = app.reconnectPlayer({
      guestSessionId: 'guest-7',
      roomCode: room.room_code,
      roomId: room.room_id,
      roomPlayerId: currentBinding.roomPlayerId,
      resumeToken: currentBinding.resumeToken,
    });
    playerState = app.getPlayerRoomState({ guestSessionId: 'guest-7', roomCode: room.room_code });

    expect(playerState.shared_room.lifecycle_state).toBe('finished');
    expect(playerState.shared_room.question_phase).toBeNull();
    expect(playerState.active_question).toBeNull();
    expect(playerState.leaderboard).toBeTruthy();
    expect(currentBinding.resumeExpiresAt).toBe('2026-03-06T12:40:00.000Z');
    expect(app.getHostRoomState({ actor: authorActor, roomCode: room.room_code, transportSessionId: hostTransportSessionId }).allowed_actions).toEqual([]);

    expect(() =>
      app.reconnectPlayer({
        guestSessionId: 'guest-replay',
        roomCode: room.room_code,
        roomId: room.room_id,
        roomPlayerId: currentBinding.roomPlayerId,
        resumeToken: initialBinding.resumeToken,
      }),
    ).toThrow(InvalidOperationError);

    now = new Date('2026-03-06T12:40:00.001Z');

    expect(app.getHostRoomState({ actor: authorActor, roomCode: room.room_code, transportSessionId: hostTransportSessionId }).shared_room.lifecycle_state).toBe(
      'expired',
    );

    playerState = app.getPlayerRoomState({ guestSessionId: 'guest-7', roomCode: room.room_code });
    expect(playerState.shared_room.lifecycle_state).toBe('expired');
    expect(playerState.leaderboard).toBeNull();

    expect(() =>
      app.reconnectPlayer({
        guestSessionId: 'guest-expired',
        roomCode: room.room_code,
        roomId: room.room_id,
        roomPlayerId: currentBinding.roomPlayerId,
        resumeToken: currentBinding.resumeToken,
      }),
    ).toThrow(InvalidOperationError);

    const loggedMessages = (consoleInfoMock.mock.calls as unknown[][]).map((call) => String(call[0] ?? ''));
    expect(loggedMessages.join('\n')).not.toContain(room.host_claim_token);
    expect(loggedMessages.join('\n')).not.toContain(initialBinding.resumeToken);
    expect(loggedMessages.join('\n')).not.toContain(currentBinding.resumeToken);

    const loggedEntries = loggedMessages.map((entry) => JSON.parse(entry));
    expect(loggedEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'runtime.create_room',
          environment: 'local',
          deploymentId: null,
          metadata: expect.objectContaining({
            roomId: room.room_id,
            roomCode: room.room_code,
            sourceQuizId: publishedQuiz!.quiz_id,
            clerkUserId: authorActor.clerkUserId,
          }),
        }),
        expect.objectContaining({
          event: 'runtime.player_join',
          metadata: expect.objectContaining({
            roomId: room.room_id,
            roomCode: room.room_code,
            roomPlayerId: initialBinding.roomPlayerId,
            lifecycleState: 'lobby',
            bindingReused: false,
          }),
        }),
        expect.objectContaining({
          event: 'runtime.player_reconnect',
          metadata: expect.objectContaining({
            roomId: room.room_id,
            roomCode: room.room_code,
            roomPlayerId: initialBinding.roomPlayerId,
          }),
        }),
        expect.objectContaining({
          event: 'runtime.lifecycle_transition',
          metadata: expect.objectContaining({
            roomId: room.room_id,
            roomCode: room.room_code,
            action: 'start_game',
            previousLifecycleState: 'lobby',
            resultingLifecycleState: 'in_progress',
            resultingQuestionPhase: 'question_open',
          }),
        }),
        expect.objectContaining({
          event: 'runtime.lifecycle_transition',
          metadata: expect.objectContaining({
            roomId: room.room_id,
            roomCode: room.room_code,
            action: 'close_question',
            resultingQuestionPhase: 'question_closed',
          }),
        }),
        expect.objectContaining({
          event: 'runtime.lifecycle_transition',
          metadata: expect.objectContaining({
            roomId: room.room_id,
            roomCode: room.room_code,
            action: 'reveal',
            resultingQuestionPhase: 'reveal',
          }),
        }),
        expect.objectContaining({
          event: 'runtime.lifecycle_transition',
          metadata: expect.objectContaining({
            roomId: room.room_id,
            roomCode: room.room_code,
            action: 'show_leaderboard',
            resultingQuestionPhase: 'leaderboard',
          }),
        }),
        expect.objectContaining({
          event: 'runtime.lifecycle_transition',
          metadata: expect.objectContaining({
            roomId: room.room_id,
            roomCode: room.room_code,
            action: 'finish_game',
            resultingLifecycleState: 'finished',
            resultingQuestionPhase: null,
          }),
        }),
      ]),
    );
  });
});