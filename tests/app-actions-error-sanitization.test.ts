import { afterEach, describe, expect, mock, test } from 'bun:test';
import { formatClientFacingError } from '@/lib/server/client-facing-errors';
import { AuthorizationError, InvalidOperationError } from '@/lib/server/service-errors';

class RedirectSignal extends Error {
  constructor(readonly destination: string) {
    super(`Redirected to ${destination}`);
  }
}

const actionsModulePath = require.resolve('../app/actions.ts');

function mockLocaleCookie(locale?: string) {
  mock.module('next/headers', () => ({
    cookies: async () => ({
      get: () => (locale ? { value: locale } : undefined),
    }),
  }));
}

function mockRedirects() {
  mock.module('next/navigation', () => ({
    redirect: (destination: string) => {
      throw new RedirectSignal(destination);
    },
  }));
}

async function expectRedirect(action: Promise<unknown>) {
  try {
    await action;
  } catch (error) {
    if (error instanceof RedirectSignal) {
      return new URL(error.destination, 'https://example.test');
    }
    throw error;
  }

  throw new Error('Expected the action to redirect.');
}

function loadActionsModule() {
  delete require.cache[actionsModulePath];
  return require(actionsModulePath) as typeof import('@/app/actions');
}

afterEach(() => {
  mock.restore();
});

describe('server action client-facing errors', () => {
  test('preserves authorization and validation messages while sanitizing operational details', () => {
    expect(formatClientFacingError(new AuthorizationError('Sign in as the demo author to continue'), 'fallback')).toBe(
      'Sign in as the demo author to continue',
    );
    expect(formatClientFacingError(new InvalidOperationError('Images must be 5 MiB or smaller.'), 'fallback')).toBe(
      'Images must be 5 MiB or smaller.',
    );
    expect(
      formatClientFacingError(
        new Error('Cloudflare R2 put failed (500) for quiz-images/quiz-1/questions/question-1/secret.png.'),
        'Could not save the image right now. Please try again.',
      ),
    ).toBe('Could not save the image right now. Please try again.');
    expect(
      formatClientFacingError(
        new InvalidOperationError(
          'Cloudflare R2 quiz image storage is not configured. Missing: CLOUDFLARE_R2_ACCESS_KEY_ID.',
        ),
        'Could not save the image right now. Please try again.',
      ),
    ).toBe('Could not save the image right now. Please try again.');
    expect(
      formatClientFacingError(
        new InvalidOperationError('Only published quizzes can bootstrap runtime rooms'),
        'Could not create the host room right now. Please try again.',
      ),
    ).toBe('Only published quizzes can bootstrap runtime rooms');
  });

  test('createRoomAction redirects with a sanitized Czech fallback when no locale cookie is present', async () => {
    mockLocaleCookie();
    mockRedirects();
    mock.module('@/lib/server/author-auth', () => ({
      CLERK_SIGN_IN_PATH: '/sign-in',
      getProtectedAuthorActor: async () => ({ clerkUserId: 'user-1', clerkSessionId: 'session-1' }),
      getProtectedAuthorState: async () => ({ status: 'authenticated', actor: { clerkUserId: 'user-1', clerkSessionId: 'session-1' } }),
      requireProtectedAuthorActor: async () => ({ clerkUserId: 'user-1', clerkSessionId: 'session-1' }),
    }));
    mock.module('@/lib/server/demo-session', () => ({
      ensureDemoHostSessionId: async () => 'host-1',
      ensureDemoGuestSessionId: async () => 'guest-1',
      getDemoGuestSessionId: async () => 'guest-1',
      getDemoPlayerBinding: async () => null,
      setDemoPlayerBinding: async () => {},
      clearDemoPlayerBinding: async () => {},
    }));
    mock.module('@/lib/server/app-service', () => ({
      getAppOperationalReadiness: () => ({
        authoring: { isConfigured: true, missingKeys: [] },
        runtime: { canCreateRooms: true, canIssueHostClaims: true, missing: [] },
      }),
      getAppService: () => ({
        createRoom: async () => {
          throw new Error('Cloudflare R2 createRoom failed (500) for quiz-images/quiz-1/secret.png.');
        },
        claimHost: () => {},
      }),
    }));

    const { createRoomAction } = loadActionsModule();
    const formData = new FormData();
    formData.set('quizId', 'quiz-1');

    const redirectUrl = await expectRedirect(createRoomAction(formData));

    expect(redirectUrl.pathname).toBe('/dashboard');
    expect(redirectUrl.searchParams.get('error')).toBe('Nepodařilo se teď vytvořit místnost moderátora. Zkuste to prosím znovu.');
    expect(redirectUrl.searchParams.get('error')).not.toContain('Cloudflare R2');
    expect(redirectUrl.searchParams.get('error')).not.toContain('secret.png');
  });

  test('createRoomAction redirects with an English fallback when the locale cookie requests en', async () => {
    mockLocaleCookie('en');
    mockRedirects();
    mock.module('@/lib/server/author-auth', () => ({
      CLERK_SIGN_IN_PATH: '/sign-in',
      getProtectedAuthorActor: async () => ({ clerkUserId: 'user-1', clerkSessionId: 'session-1' }),
      getProtectedAuthorState: async () => ({ status: 'authenticated', actor: { clerkUserId: 'user-1', clerkSessionId: 'session-1' } }),
      requireProtectedAuthorActor: async () => ({ clerkUserId: 'user-1', clerkSessionId: 'session-1' }),
    }));
    mock.module('@/lib/server/demo-session', () => ({
      ensureDemoHostSessionId: async () => 'host-1',
      ensureDemoGuestSessionId: async () => 'guest-1',
      getDemoGuestSessionId: async () => 'guest-1',
      getDemoPlayerBinding: async () => null,
      setDemoPlayerBinding: async () => {},
      clearDemoPlayerBinding: async () => {},
    }));
    mock.module('@/lib/server/app-service', () => ({
      getAppOperationalReadiness: () => ({
        authoring: { isConfigured: true, missingKeys: [] },
        runtime: { canCreateRooms: true, canIssueHostClaims: true, missing: [] },
      }),
      getAppService: () => ({
        createRoom: async () => {
          throw new Error('Cloudflare R2 createRoom failed (500) for quiz-images/quiz-1/secret.png.');
        },
        claimHost: () => {},
      }),
    }));

    const { createRoomAction } = loadActionsModule();
    const formData = new FormData();
    formData.set('quizId', 'quiz-1');

    const redirectUrl = await expectRedirect(createRoomAction(formData));

    expect(redirectUrl.pathname).toBe('/dashboard');
    expect(redirectUrl.searchParams.get('error')).toBe('Could not create the host room right now. Please try again.');
    expect(redirectUrl.searchParams.get('error')).not.toContain('Cloudflare R2');
    expect(redirectUrl.searchParams.get('error')).not.toContain('secret.png');
  });
});