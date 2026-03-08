/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { getClerkEnvStatus } from '@/lib/env/clerk';
import { ConfigurationError } from '@/lib/env/shared';
import { parsePublicRuntimeConfig } from '@/lib/env/public';

afterEach(() => {
  mock.restore();
});

async function loadServerEnvModule() {
  mock.module('server-only', () => ({}));
  return import('@/lib/env/server');
}

async function loadRuntimeBootstrapModule() {
  mock.module('server-only', () => ({}));
  return import('@/lib/server/runtime-bootstrap');
}

describe('environment configuration boundary', () => {
  test('parses explicit public runtime config and trims optional browser-safe values', () => {
    const config = parsePublicRuntimeConfig({
      NEXT_PUBLIC_APP_ENV: 'preview',
      NEXT_PUBLIC_APP_URL: ' https://preview.example.com/app ',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ' pk_test_123 ',
      NEXT_PUBLIC_SPACETIME_ENDPOINT: ' https://runtime.example.com ',
    });

    expect(config).toEqual({
      environment: 'preview',
      appUrl: 'https://preview.example.com/app',
      clerkPublishableKey: 'pk_test_123',
      spacetimeEndpoint: 'https://runtime.example.com',
    });
  });

  test('reports Clerk as unconfigured until both keys are present', () => {
    expect(
      getClerkEnvStatus({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_123',
      }),
    ).toEqual({
      publishableKey: 'pk_test_123',
      missingKeys: ['CLERK_SECRET_KEY'],
      isConfigured: false,
    });

    expect(
      getClerkEnvStatus({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_123',
        CLERK_SECRET_KEY: 'sk_test_123',
      }),
    ).toEqual({
      publishableKey: 'pk_test_123',
      missingKeys: [],
      isConfigured: true,
    });
  });

  test('rejects missing or invalid explicit public environment selection', () => {
    expect(() =>
      parsePublicRuntimeConfig({
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      parsePublicRuntimeConfig({
        NEXT_PUBLIC_APP_ENV: 'staging',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      }),
    ).toThrow('NEXT_PUBLIC_APP_ENV');
  });

  test('rejects an invalid public application URL', () => {
    expect(() =>
      parsePublicRuntimeConfig({
        NEXT_PUBLIC_APP_ENV: 'local',
        NEXT_PUBLIC_APP_URL: 'not-a-url',
      }),
    ).toThrow('NEXT_PUBLIC_APP_URL');
  });

  test('parses server-only secrets into trimmed typed values', async () => {
    const { parseServerEnv } = await loadServerEnvModule();

    expect(
      parseServerEnv({
        CLERK_SECRET_KEY: ' sk_test_123 ',
        SPACETIME_ADMIN_TOKEN: '   ',
        SPACETIME_DATABASE: ' quiz-1j871 ',
        RUNTIME_BOOTSTRAP_SIGNING_KEY: ' signing-key ',
      }),
    ).toEqual({
      clerkSecretKey: 'sk_test_123',
      cloudflareR2AccessKeyId: null,
      cloudflareR2AccountId: null,
      cloudflareR2BucketName: 'quiz',
      cloudflareR2SecretAccessKey: null,
      spacetimeAdminToken: null,
      spacetimeDatabase: 'quiz-1j871',
      runtimeBootstrapSigningKey: 'signing-key',
    });
  });

  test('reports missing runtime bootstrap secrets by capability', async () => {
    const { getRuntimeBootstrapReadiness } = await loadRuntimeBootstrapModule();

    expect(
      getRuntimeBootstrapReadiness({
        NEXT_PUBLIC_SPACETIME_ENDPOINT: ' ',
        SPACETIME_DATABASE: 'quiz-1j871',
        SPACETIME_ADMIN_TOKEN: 'admin-token',
        RUNTIME_BOOTSTRAP_SIGNING_KEY: '',
      }),
    ).toEqual({
      canCreateRooms: false,
      canIssueHostClaims: false,
      missing: ['NEXT_PUBLIC_SPACETIME_ENDPOINT', 'RUNTIME_BOOTSTRAP_SIGNING_KEY'],
    });
  });

  test('fails loudly when a runtime bootstrap path requires missing server secrets', async () => {
    const { parseRuntimeBootstrapSpacetimeConfig, requireRuntimeBootstrapEnv } = await loadRuntimeBootstrapModule();

    expect(() =>
      requireRuntimeBootstrapEnv('create-room', {
        NEXT_PUBLIC_SPACETIME_ENDPOINT: 'https://maincloud.spacetimedb.com',
        SPACETIME_DATABASE: '',
        SPACETIME_ADMIN_TOKEN: 'admin-token',
        RUNTIME_BOOTSTRAP_SIGNING_KEY: 'signing-key',
      }),
    ).toThrow('SPACETIME_DATABASE');

    expect(
      parseRuntimeBootstrapSpacetimeConfig({
        NEXT_PUBLIC_SPACETIME_ENDPOINT: ' https://maincloud.spacetimedb.com ',
        SPACETIME_DATABASE: ' quiz-1j871 ',
        SPACETIME_ADMIN_TOKEN: ' admin-token ',
      }),
    ).toEqual({
      endpoint: 'https://maincloud.spacetimedb.com',
      databaseName: 'quiz-1j871',
      adminToken: 'admin-token',
    });

    expect(
      requireRuntimeBootstrapEnv('issue-host-claims', {
        SPACETIME_ADMIN_TOKEN: 'admin-token',
        RUNTIME_BOOTSTRAP_SIGNING_KEY: ' signing-key ',
      }),
    ).toEqual({
      runtimeBootstrapSigningKey: 'signing-key',
    });
  });
});