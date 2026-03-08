/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { createDemoSeedQuizDocuments } from '@/lib/server/demo-seed';
import { AuthorizationError } from '@/lib/server/service-errors';
import { createInMemoryAuthoringSpacetimeClientFactory } from '@/tests/support/in-memory-authoring-spacetime';
import { createInMemoryRuntimeBootstrapProvisioner } from '@/tests/support/in-memory-runtime-bootstrap';

const ORIGINAL_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;
const ORIGINAL_RUNTIME_BOOTSTRAP_SIGNING_KEY = process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY;
const ORIGINAL_CONSOLE_WARN = console.warn;

const authorActor = {
  clerkUserId: 'user-1',
  clerkSessionId: 'session-1',
};

async function loadRuntimeModules() {
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
  const [{ createAppService }, { createRuntimeHostClaimSigner }] = await Promise.all([
    import('@/lib/server/app-service'),
    import('@/lib/server/host-claim-signer'),
  ]);
  return { createAppService, createRuntimeHostClaimSigner };
}

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_ENV = ORIGINAL_APP_ENV;
  process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = ORIGINAL_RUNTIME_BOOTSTRAP_SIGNING_KEY;
  console.warn = ORIGINAL_CONSOLE_WARN;
});

describe('runtime host claim verification and binding', () => {
  test('binds host authority only after a valid claim is consumed', async () => {
    const { createAppService } = await loadRuntimeModules();
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = 'signing-key';

    const app = createAppService({
      authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(),
      runtimeProvisioner: createInMemoryRuntimeBootstrapProvisioner(),
      clock: () => new Date('2026-03-06T12:00:00.000Z'),
    });
    const publishedQuiz = (await app.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'published');
    const room = await app.createRoom({ actor: authorActor, quizId: publishedQuiz!.quiz_id });

    expect(() =>
      app.getHostRoomState({
        actor: authorActor,
        roomCode: room.room_code,
        transportSessionId: 'host-session-1',
      }),
    ).toThrow('Claim host authority before managing this room');

    const state = app.claimHost({
      actor: authorActor,
      roomCode: room.room_code,
      hostClaimToken: room.host_claim_token,
      transportSessionId: 'host-session-1',
    });

    expect(state.allowed_actions).toEqual(['start_game', 'abort_game']);
    expect(
      app.performHostAction({
        actor: authorActor,
        roomCode: room.room_code,
        action: 'start_game',
        transportSessionId: 'host-session-1',
      }).shared_room.lifecycle_state,
    ).toBe('in_progress');
  });

  test('rejects expired host claims', async () => {
    const { createAppService } = await loadRuntimeModules();
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = 'signing-key';

    let now = new Date('2026-03-06T12:00:00.000Z');
    const app = createAppService({
      authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(),
      runtimeProvisioner: createInMemoryRuntimeBootstrapProvisioner(),
      clock: () => now,
    });
    const publishedQuiz = (await app.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'published');
    const room = await app.createRoom({ actor: authorActor, quizId: publishedQuiz!.quiz_id });

    now = new Date('2026-03-06T12:01:01.000Z');

    expect(() =>
      app.claimHost({
        actor: authorActor,
        roomCode: room.room_code,
        hostClaimToken: room.host_claim_token,
        transportSessionId: 'host-session-1',
      }),
    ).toThrow('Host claim token has expired');
  });

  test('rejects claims presented for the wrong room', async () => {
    const { createAppService } = await loadRuntimeModules();
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = 'signing-key';

    const app = createAppService({
      authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(),
      runtimeProvisioner: createInMemoryRuntimeBootstrapProvisioner(),
      clock: () => new Date('2026-03-06T12:00:00.000Z'),
    });
    let quizId = (await app.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'published')?.quiz_id ?? null;
    if (!quizId) {
      const draftQuiz = (await app.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'draft');
      if (draftQuiz) {
        quizId = (await app.publishQuiz({ actor: authorActor, quizId: draftQuiz.quiz_id })).quiz.quiz_id;
      }
    }
    quizId ??= 'quiz-1';
    const firstRoom = await app.createRoom({ actor: authorActor, quizId });
    const secondRoom = await app.createRoom({ actor: authorActor, quizId });

    expect(() =>
      app.claimHost({
        actor: authorActor,
        roomCode: secondRoom.room_code,
        hostClaimToken: firstRoom.host_claim_token,
        transportSessionId: 'host-session-1',
      }),
    ).toThrow('Host claim token does not match this room');
  });

  test('logs host-claim validation failures with safe structured metadata', async () => {
    const { createAppService } = await loadRuntimeModules();
    process.env.NEXT_PUBLIC_APP_ENV = 'preview';
    process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = 'signing-key';
    const consoleWarnMock = mock(() => {});
    console.warn = consoleWarnMock as typeof console.warn;
    const seedDocuments = createDemoSeedQuizDocuments();

    const app = createAppService({
      authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(seedDocuments),
      runtimeProvisioner: createInMemoryRuntimeBootstrapProvisioner(),
      clock: () => new Date('2026-03-06T12:00:00.000Z'),
    });
    const publishedQuiz = (await app.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'published');
    expect(publishedQuiz).toBeDefined();
    const firstRoom = await app.createRoom({ actor: authorActor, quizId: publishedQuiz!.quiz_id });
    const secondRoom = await app.createRoom({ actor: authorActor, quizId: publishedQuiz!.quiz_id });

    expect(() =>
      app.claimHost({
        actor: authorActor,
        roomCode: secondRoom.room_code,
        hostClaimToken: firstRoom.host_claim_token,
        transportSessionId: 'host-session-1',
      }),
    ).toThrow('Host claim token does not match this room');

    const loggedCalls = consoleWarnMock.mock.calls as unknown[][];
    expect(loggedCalls).toHaveLength(1);
    const loggedMessage = String(loggedCalls[0]?.[0] ?? '');
    expect(loggedMessage).not.toContain(firstRoom.host_claim_token);
    expect(JSON.parse(loggedMessage)).toEqual({
      event: 'runtime.host_claim.validation_failed',
      environment: 'preview',
      deploymentId: null,
      errorName: 'AuthorizationError',
      errorMessage: 'Host claim token does not match this room',
      metadata: {
        roomId: secondRoom.room_id,
        roomCode: secondRoom.room_code,
        clerkUserId: authorActor.clerkUserId,
      },
    });
  });

  test('rejects reused host claims after the first successful bind', async () => {
    const { createAppService } = await loadRuntimeModules();
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = 'signing-key';

    const app = createAppService({
      authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(),
      runtimeProvisioner: createInMemoryRuntimeBootstrapProvisioner(),
      clock: () => new Date('2026-03-06T12:00:00.000Z'),
    });
    const publishedQuiz = (await app.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'published');
    const room = await app.createRoom({ actor: authorActor, quizId: publishedQuiz!.quiz_id });

    app.claimHost({
      actor: authorActor,
      roomCode: room.room_code,
      hostClaimToken: room.host_claim_token,
      transportSessionId: 'host-session-1',
    });

    expect(() =>
      app.claimHost({
        actor: authorActor,
        roomCode: room.room_code,
        hostClaimToken: room.host_claim_token,
        transportSessionId: 'host-session-2',
      }),
    ).toThrow('Host claim token has already been consumed');
  });

  test('rebinds authority to a newer host session without allowing dual active hosts', async () => {
    const { createAppService, createRuntimeHostClaimSigner } = await loadRuntimeModules();
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = 'signing-key';

    const clock = () => new Date('2026-03-06T12:00:00.000Z');
    const app = createAppService({
      authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(),
      runtimeProvisioner: createInMemoryRuntimeBootstrapProvisioner(),
      clock,
    });
    const publishedQuiz = (await app.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'published');
    const room = await app.createRoom({ actor: authorActor, quizId: publishedQuiz!.quiz_id });

    app.claimHost({
      actor: authorActor,
      roomCode: room.room_code,
      hostClaimToken: room.host_claim_token,
      transportSessionId: 'host-session-1',
    });

    const signer = createRuntimeHostClaimSigner('signing-key');
    const replacementClaim = await signer.signHostClaim({
      purpose: 'host_claim',
      room_id: room.room_id,
      clerk_user_id: authorActor.clerkUserId,
      clerk_session_id: authorActor.clerkSessionId,
      jti: 'claim-rebind-2',
      iat: Math.floor(clock().getTime() / 1000),
      exp: Math.floor(clock().getTime() / 1000) + 60,
      v: 1,
    });

    const reboundState = app.claimHost({
      actor: authorActor,
      roomCode: room.room_code,
      hostClaimToken: replacementClaim,
      transportSessionId: 'host-session-2',
    });

    expect(reboundState.allowed_actions).toEqual(['start_game', 'abort_game']);
    expect(() =>
      app.performHostAction({
        actor: authorActor,
        roomCode: room.room_code,
        action: 'start_game',
        transportSessionId: 'host-session-1',
      }),
    ).toThrow('This host session is no longer active for the room');

    const nextState = app.performHostAction({
      actor: authorActor,
      roomCode: room.room_code,
      action: 'start_game',
      transportSessionId: 'host-session-2',
    });

    expect(nextState.shared_room.lifecycle_state).toBe('in_progress');
    expect(() =>
      app.getHostRoomState({
        actor: authorActor,
        roomCode: room.room_code,
        transportSessionId: 'host-session-1',
      }),
    ).toThrow(AuthorizationError);
  });
});