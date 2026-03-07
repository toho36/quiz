/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { ConfigurationError } from '@/lib/env/shared';
import { AuthorizationError } from '@/lib/server/service-errors';

const ORIGINAL_CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const ORIGINAL_CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

let authCallCount = 0;
let mockedClerkAuthState = { userId: null as string | null, sessionId: null as string | null };

afterEach(() => {
  mock.restore();
  authCallCount = 0;
  mockedClerkAuthState = { userId: null, sessionId: null };
  process.env.CLERK_SECRET_KEY = ORIGINAL_CLERK_SECRET_KEY;
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = ORIGINAL_CLERK_PUBLISHABLE_KEY;
});

async function loadAuthorAuthModule() {
  mock.module('server-only', () => ({}));
  mock.module('@clerk/nextjs/server', () => ({
    auth: async () => {
      authCallCount += 1;
      return mockedClerkAuthState;
    },
  }));
  return import('@/lib/server/author-auth');
}

describe('protected author resolver', () => {
  test('maps a verified Clerk auth result into an authenticated author actor', async () => {
    const { createProtectedAuthorResolver } = await loadAuthorAuthModule();

    const resolver = createProtectedAuthorResolver({
      async loadClerkAuth() {
        return { userId: ' user-1 ', sessionId: ' session-1 ' };
      },
    });

    await expect(resolver.getActor()).resolves.toEqual({
      clerkUserId: 'user-1',
      clerkSessionId: 'session-1',
    });
  });

  test('treats incomplete Clerk auth state as unauthenticated', async () => {
    const { createProtectedAuthorResolver } = await loadAuthorAuthModule();

    const resolver = createProtectedAuthorResolver({
      async loadClerkAuth() {
        return { userId: 'user-1', sessionId: null };
      },
    });

    await expect(resolver.getState()).resolves.toEqual({ status: 'unauthenticated' });
    await expect(resolver.requireActor()).rejects.toBeInstanceOf(AuthorizationError);
  });

  test('surfaces setup blockers when Clerk integration is unavailable', async () => {
    const { CLERK_INSTALL_COMMAND, createProtectedAuthorResolver } = await loadAuthorAuthModule();

    const resolver = createProtectedAuthorResolver({
      async loadClerkAuth() {
        throw new ConfigurationError(`Install the Clerk Next.js SDK with \`${CLERK_INSTALL_COMMAND}\`.`);
      },
    });

    await expect(resolver.getState()).resolves.toMatchObject({
      status: 'setup-required',
      installCommand: CLERK_INSTALL_COMMAND,
    });
    await expect(resolver.requireActor()).rejects.toThrow(CLERK_INSTALL_COMMAND);
  });
});

describe('default protected author integration', () => {
  test('surfaces setup-required state when Clerk env is missing', async () => {
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

    const { getProtectedAuthorActor, getProtectedAuthorState } = await loadAuthorAuthModule();

    await expect(getProtectedAuthorActor()).resolves.toBeNull();
    await expect(getProtectedAuthorState()).resolves.toMatchObject({
      status: 'setup-required',
      missingEnvKeys: ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'],
    });
    expect(authCallCount).toBe(0);
  });

  test('reads the protected author from Clerk server auth when env is configured', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_123';
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_123';
    mockedClerkAuthState = { userId: 'user-1', sessionId: 'session-1' };

    const { getProtectedAuthorActor, requireProtectedAuthorActor } = await loadAuthorAuthModule();

    await expect(getProtectedAuthorActor()).resolves.toEqual({
      clerkUserId: 'user-1',
      clerkSessionId: 'session-1',
    });
    await expect(requireProtectedAuthorActor()).resolves.toEqual({
      clerkUserId: 'user-1',
      clerkSessionId: 'session-1',
    });
    expect(authCallCount).toBeGreaterThan(0);
  });
});