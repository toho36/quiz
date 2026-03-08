/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import dictionary from '@/lib/i18n/dictionaries/cs';
import type { ProtectedAuthorState } from '@/lib/server/author-auth';

const pageModulePath = require.resolve('../app/(marketing)/page.tsx');

let mockedAuthorState: ProtectedAuthorState = { status: 'unauthenticated' };

function stringifyHref(href: string | { pathname: string; query?: Record<string, string> }) {
  if (typeof href === 'string') {
    return href;
  }

  const search = href.query ? `?${new URLSearchParams(href.query).toString()}` : '';
  return `${href.pathname}${search}`;
}

function installMocks() {
  mock.module('next/link', () => ({
    default({ href, children }: { href: string | { pathname: string; query?: Record<string, string> }; children: ReactNode }) {
      return <a href={stringifyHref(href)}>{children}</a>;
    },
  }));

  mock.module('next/headers', () => ({
    cookies: async () => ({
      get: () => undefined,
    }),
  }));

  mock.module('@/lib/server/author-auth', () => ({
    CLERK_SIGN_IN_PATH: '/sign-in' as Route,
    getProtectedAuthorActor: async () => ({ clerkUserId: 'user-1', clerkSessionId: 'session-1' }),
    getProtectedAuthorState: async () => mockedAuthorState,
    requireProtectedAuthorActor: async () => ({ clerkUserId: 'user-1', clerkSessionId: 'session-1' }),
  }));
}

async function loadLandingPageModule() {
  installMocks();
  delete require.cache[pageModulePath];
  return require(pageModulePath) as typeof import('@/app/(marketing)/page');
}

afterEach(() => {
  mock.restore();
});

describe('marketing landing surface', () => {
  test('shows playful signed-out entry points while preserving sign-in and join CTAs', async () => {
    mockedAuthorState = { status: 'unauthenticated' };

    const { default: LandingPage } = await loadLandingPageModule();
    const html = renderToStaticMarkup(await LandingPage());

    expect(html).toContain(dictionary.landing.title);
    expect(html).toContain(dictionary.dashboardPage.signInTitle);
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain('href="/join"');
    expect(html).toContain(dictionary.landing.openJoinFlow);
  });

  test('shows dashboard access for authenticated authors', async () => {
    mockedAuthorState = {
      status: 'authenticated',
      actor: { clerkUserId: 'user-1', clerkSessionId: 'session-1' },
    };

    const { default: LandingPage } = await loadLandingPageModule();
    const html = renderToStaticMarkup(await LandingPage());

    expect(html).toContain(dictionary.landing.openDashboard);
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/join"');
    expect(html).not.toContain(dictionary.dashboardPage.signInTitle);
  });

  test('shows setup guidance exactly once when author setup is required', async () => {
    mockedAuthorState = {
      status: 'setup-required',
      message: 'Missing Clerk env.',
      installCommand: 'bun add @clerk/nextjs',
      missingEnvKeys: ['CLERK_SECRET_KEY'],
    };

    const { default: LandingPage } = await loadLandingPageModule();
    const html = renderToStaticMarkup(await LandingPage());

    expect((html.match(/Missing Clerk env\./g) ?? [])).toHaveLength(1);
    expect(html).toContain('Missing env: CLERK_SECRET_KEY');
    expect(html).toContain('href="/join"');
  });
});