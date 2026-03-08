/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProtectedAuthorState } from '@/lib/server/author-auth';

const pageModulePath = require.resolve('../app/(marketing)/page.tsx');

let mockedAuthorState: ProtectedAuthorState = { status: 'unauthenticated' };

function installMocks() {
  mock.module('next/link', () => ({
    default({ href, children }: { href: string; children: ReactNode }) {
      return <a href={href}>{children}</a>;
    },
  }));

  mock.module('@/lib/server/author-auth', () => ({
    CLERK_SIGN_IN_PATH: '/sign-in' as Route,
    getProtectedAuthorState: async () => mockedAuthorState,
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

    expect(html).toContain('Bring your next quiz night to life');
    expect(html).toContain('Sign in with Clerk');
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain('href="/join"');
  });

  test('shows dashboard access for authenticated authors', async () => {
    mockedAuthorState = {
      status: 'authenticated',
      actor: { clerkUserId: 'user-1', clerkSessionId: 'session-1' },
    };

    const { default: LandingPage } = await loadLandingPageModule();
    const html = renderToStaticMarkup(await LandingPage());

    expect(html).toContain('Open dashboard');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/join"');
  });
});