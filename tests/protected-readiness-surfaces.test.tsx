/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProtectedAuthorState } from '@/lib/server/author-auth';

afterEach(() => {
  mock.restore();
});

function installMocks() {
  mock.module('next/link', () => ({
    default({ href, children }: { href: string; children: ReactNode }) {
      return <a href={href}>{children}</a>;
    },
  }));

  mock.module('@/components/page-shell', () => ({
    PageShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
      return <section><h1>{title}</h1><p>{description}</p>{children}</section>;
    },
  }));

  mock.module('@/components/section-card', () => ({
    SectionCard({ title, children }: { title: string; children: ReactNode }) {
      return <section><h2>{title}</h2>{children}</section>;
    },
  }));

  mock.module('@/components/ui/button', () => ({
    Button({ asChild, children, ...props }: { asChild?: boolean; children: ReactNode } & Record<string, unknown>) {
      return asChild ? <span>{children}</span> : <button {...props}>{children}</button>;
    },
  }));
}

async function loadSurfacesModule() {
  installMocks();
  return import('@/components/protected-readiness-surfaces');
}

describe('protected readiness surfaces', () => {
  test('dashboard shows the setup-required guard when Clerk env is missing', async () => {
    const { DashboardProtectedGuardSurface } = await loadSurfacesModule();
    const authorState: ProtectedAuthorState = {
      status: 'setup-required',
      message: 'Missing Clerk env.',
      installCommand: 'bun add @clerk/nextjs',
      missingEnvKeys: ['CLERK_SECRET_KEY'],
    };

    const html = renderToStaticMarkup(<DashboardProtectedGuardSurface authorState={authorState} signInPath={'/sign-in' as Route} />);

    expect(html).toContain('Author dashboard is guarded');
    expect(html).toContain('Missing Clerk env.');
    expect(html).toContain('Missing env: CLERK_SECRET_KEY');
    expect(html).not.toContain('Open sign-in');
  });

  test('dashboard shows runtime readiness messaging', async () => {
    const { DashboardRuntimeReadinessSurface } = await loadSurfacesModule();
    const html = renderToStaticMarkup(
      <DashboardRuntimeReadinessSurface missingEnvKeys={['NEXT_PUBLIC_SPACETIME_ENDPOINT', 'RUNTIME_BOOTSTRAP_SIGNING_KEY']} />,
    );

    expect(html).toContain('Runtime bootstrap setup required');
    expect(html).toContain('Creating new host rooms is blocked until runtime bootstrap env is complete. Missing env: NEXT_PUBLIC_SPACETIME_ENDPOINT, RUNTIME_BOOTSTRAP_SIGNING_KEY');
  });

  test('authoring shows the unauthenticated guard with a sign-in path', async () => {
    const { AuthoringProtectedGuardSurface } = await loadSurfacesModule();
    const html = renderToStaticMarkup(
      <AuthoringProtectedGuardSurface authorState={{ status: 'unauthenticated' }} signInPath={'/sign-in' as Route} />,
    );

    expect(html).toContain('Authoring requires Clerk-backed auth');
    expect(html).toContain('Sign in with Clerk to edit quizzes.');
    expect(html).toContain('href="/sign-in"');
  });

  test('authoring shows operator readiness when persistence env is incomplete', async () => {
    const { AuthoringPersistenceReadinessSurface } = await loadSurfacesModule();
    const html = renderToStaticMarkup(
      <AuthoringPersistenceReadinessSurface missingEnvKeys={['SPACETIME_DATABASE', 'SPACETIME_ADMIN_TOKEN']} />,
    );

    expect(html).toContain('Authoring persistence setup required');
    expect(html).toContain('Missing env: SPACETIME_DATABASE, SPACETIME_ADMIN_TOKEN');
  });

  test('host shows the setup-required guard when Clerk setup is incomplete', async () => {
    const { HostProtectedGuardSurface } = await loadSurfacesModule();
    const authorState: ProtectedAuthorState = {
      status: 'setup-required',
      message: 'Protected host auth is not configured.',
      installCommand: 'bun add @clerk/nextjs',
      missingEnvKeys: ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'],
    };

    const html = renderToStaticMarkup(<HostProtectedGuardSurface authorState={authorState} signInPath={'/sign-in' as Route} />);

    expect(html).toContain('Host room access is guarded');
    expect(html).toContain('Protected host auth is not configured.');
    expect(html).toContain('Missing env: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
    expect(html).not.toContain('Open sign-in');
  });

  test('host shows runtime readiness messaging', async () => {
    const { HostRuntimeReadinessSurface } = await loadSurfacesModule();
    const html = renderToStaticMarkup(
      <HostRuntimeReadinessSurface missingEnvKeys={['SPACETIME_DATABASE', 'RUNTIME_BOOTSTRAP_SIGNING_KEY']} />,
    );

    expect(html).toContain('Runtime bootstrap setup required');
    expect(html).toContain('New protected host bootstrap is blocked until runtime bootstrap env is complete. Missing env: SPACETIME_DATABASE, RUNTIME_BOOTSTRAP_SIGNING_KEY');
  });
});