/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { InvalidOperationError } from '@/lib/server/service-errors';
import type { HostAllowedAction } from '@/lib/shared/contracts';

class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(`Redirected to ${location}`);
  }
}

const ORIGINAL_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;
const ORIGINAL_CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const ORIGINAL_SPACETIME_ADMIN_TOKEN = process.env.SPACETIME_ADMIN_TOKEN;
const ORIGINAL_RUNTIME_BOOTSTRAP_SIGNING_KEY = process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY;
const ORIGINAL_CONSOLE_ERROR = console.error;

const protectedActor = { clerkUserId: 'user-1', clerkSessionId: 'session-1' };

type CreateRoomInput = { actor: typeof protectedActor; quizId: string };
type PerformHostActionInput = { actor: typeof protectedActor; roomCode: string; action: HostAllowedAction };

let mockedCreateRoom = async (_input: CreateRoomInput) => ({ room_code: 'ABCD12' });
let mockedPerformHostAction = (_input: PerformHostActionInput) => {};
let mockedRequireProtectedAuthorActor = async () => protectedActor;
let mockedReadiness = {
  authoring: { isConfigured: false, missingKeys: ['SPACETIME_ADMIN_TOKEN'] },
  runtime: {
    canCreateRooms: false,
    canIssueHostClaims: true,
    missing: ['NEXT_PUBLIC_SPACETIME_ENDPOINT'],
  },
};
let consoleErrorMock = mock(() => {});
let actionsModulePromise: Promise<typeof import('@/app/actions')> | undefined;
const actionsModulePath = require.resolve('../app/actions.ts');

function installMocks() {
  mock.module('server-only', () => ({}));
  mock.module('next/navigation', () => ({
    redirect(location: string) {
      throw new RedirectSignal(location);
    },
  }));
  mock.module('@/lib/server/app-service', () => ({
    getAppOperationalReadiness: () => mockedReadiness,
    getAppService: () => ({
      createRoom: (input: CreateRoomInput) => mockedCreateRoom(input),
      performHostAction: (input: PerformHostActionInput) => mockedPerformHostAction(input),
    }),
  }));
  mock.module('@/lib/server/author-auth', () => ({
    requireProtectedAuthorActor: () => mockedRequireProtectedAuthorActor(),
  }));
}

async function loadActionsModule() {
  if (!actionsModulePromise) {
    installMocks();
    delete require.cache[actionsModulePath];
    actionsModulePromise = Promise.resolve(require(actionsModulePath) as typeof import('@/app/actions'));
  }
  return actionsModulePromise;
}

function parseRedirectLocation(location: string) {
  return new URL(location, 'https://example.test');
}

function createFormData(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

afterEach(() => {
  actionsModulePromise = undefined;
  mockedCreateRoom = async (_input: CreateRoomInput) => ({ room_code: 'ABCD12' });
  mockedPerformHostAction = (_input: PerformHostActionInput) => {};
  mockedRequireProtectedAuthorActor = async () => protectedActor;
  mockedReadiness = {
    authoring: { isConfigured: false, missingKeys: ['SPACETIME_ADMIN_TOKEN'] },
    runtime: {
      canCreateRooms: false,
      canIssueHostClaims: true,
      missing: ['NEXT_PUBLIC_SPACETIME_ENDPOINT'],
    },
  };
  consoleErrorMock = mock(() => {});
  mock.restore();
  console.error = ORIGINAL_CONSOLE_ERROR;
  process.env.NEXT_PUBLIC_APP_ENV = ORIGINAL_APP_ENV;
  process.env.CLERK_SECRET_KEY = ORIGINAL_CLERK_SECRET_KEY;
  process.env.SPACETIME_ADMIN_TOKEN = ORIGINAL_SPACETIME_ADMIN_TOKEN;
  process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = ORIGINAL_RUNTIME_BOOTSTRAP_SIGNING_KEY;
});

describe('protected action failure handling', () => {
  test('redirects unexpected protected room-creation failures with a generic user message and redacted structured logs', async () => {
    const { createRoomAction } = await loadActionsModule();
    process.env.NEXT_PUBLIC_APP_ENV = 'preview';
    process.env.CLERK_SECRET_KEY = 'sk_test_secret';
    process.env.SPACETIME_ADMIN_TOKEN = 'spacetime-admin-secret';
    process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = 'runtime-signing-secret';
    consoleErrorMock = mock(() => {});
    console.error = consoleErrorMock as typeof console.error;
    mockedCreateRoom = async () => {
      throw new Error(
        'bootstrap failed for sk_test_secret and spacetime-admin-secret via runtime-signing-secret',
      );
    };

    let redirectError: RedirectSignal | undefined;
    try {
      await createRoomAction(createFormData({ quizId: 'quiz-1' }));
    } catch (error) {
      redirectError = error as RedirectSignal;
    }

    expect(redirectError).toBeInstanceOf(RedirectSignal);
    const redirectUrl = parseRedirectLocation(redirectError!.location);
    expect(redirectUrl.pathname).toBe('/dashboard');
    expect(redirectUrl.searchParams.get('error')).toBe(
      'The request could not be completed. Check runtime readiness and server logs.',
    );

    const loggedCalls = consoleErrorMock.mock.calls as unknown[][];
    expect(loggedCalls).toHaveLength(1);
    const loggedMessage = String(loggedCalls[0]?.[0] ?? '');
    expect(loggedMessage).not.toContain('sk_test_secret');
    expect(loggedMessage).not.toContain('spacetime-admin-secret');
    expect(loggedMessage).not.toContain('runtime-signing-secret');

    expect(JSON.parse(loggedMessage)).toEqual({
      event: 'host.create_room_failed',
      environment: 'preview',
      errorName: 'Error',
      errorMessage: 'bootstrap failed for [redacted] and [redacted] via [redacted]',
      metadata: { actorUserId: 'user-1', quizId: 'quiz-1' },
      readiness: {
        authoringConfigured: false,
        missingAuthoringKeys: ['SPACETIME_ADMIN_TOKEN'],
        canCreateRooms: false,
        canIssueHostClaims: true,
        missingRuntimeKeys: ['NEXT_PUBLIC_SPACETIME_ENDPOINT'],
      },
    });
  });

  test('preserves known protected host-action errors in the redirect message', async () => {
    const { hostRoomAction } = await loadActionsModule();
    consoleErrorMock = mock(() => {});
    console.error = consoleErrorMock as typeof console.error;
    mockedPerformHostAction = () => {
      throw new InvalidOperationError('Host controls are unavailable until the room is ready.');
    };

    let redirectError: RedirectSignal | undefined;
    try {
      await hostRoomAction(createFormData({ roomCode: ' abcd12 ', action: 'start_game' }));
    } catch (error) {
      redirectError = error as RedirectSignal;
    }

    expect(redirectError).toBeInstanceOf(RedirectSignal);
    const redirectUrl = parseRedirectLocation(redirectError!.location);
    expect(redirectUrl.pathname).toBe('/host');
    expect(redirectUrl.searchParams.get('roomCode')).toBe('ABCD12');
    expect(redirectUrl.searchParams.get('error')).toBe('Host controls are unavailable until the room is ready.');
  });
});