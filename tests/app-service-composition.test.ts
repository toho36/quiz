/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { createInMemoryAuthoringSpacetimeClientFactory } from '@/tests/support/in-memory-authoring-spacetime';

function installSpacetimeDbMock() {
  class MockDbConnectionImpl {}

  class MockDbConnectionBuilder {
    constructor(..._args: unknown[]) {}

    withUri() {
      return this;
    }

    withDatabaseName() {
      return this;
    }

    withToken() {
      return this;
    }

    onConnect() {
      return this;
    }

    build() {
      return new MockDbConnectionImpl();
    }
  }

  mock.module('spacetimedb', () => ({
    DbConnectionBuilder: MockDbConnectionBuilder,
    DbConnectionImpl: MockDbConnectionImpl,
    procedureSchema: () => ({}),
    procedures: () => ({}),
    reducers: () => ({ reducersType: { reducers: {} } }),
    schema: () => ({ schemaType: { tables: {} } }),
    t: new Proxy({}, { get: (_target, property) => (...args: unknown[]) => ({ property, args }) }),
  }));
}

async function loadAppServiceModule() {
  installSpacetimeDbMock();
  return import(`@/lib/server/app-service?app-service-composition=${Date.now()}-${Math.random()}`);
}

const ORIGINAL_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;
const ORIGINAL_SPACETIME_DATABASE = process.env.SPACETIME_DATABASE;
const ORIGINAL_SPACETIME_ADMIN_TOKEN = process.env.SPACETIME_ADMIN_TOKEN;
const ORIGINAL_RUNTIME_BOOTSTRAP_SIGNING_KEY = process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY;
const ORIGINAL_SPACETIME_ENDPOINT = process.env.NEXT_PUBLIC_SPACETIME_ENDPOINT;

const actor = {
  clerkUserId: 'user-1',
  clerkSessionId: 'session-1',
};

afterEach(() => {
  mock.restore();
  process.env.NEXT_PUBLIC_APP_ENV = ORIGINAL_APP_ENV;
  process.env.SPACETIME_DATABASE = ORIGINAL_SPACETIME_DATABASE;
  process.env.SPACETIME_ADMIN_TOKEN = ORIGINAL_SPACETIME_ADMIN_TOKEN;
  process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = ORIGINAL_RUNTIME_BOOTSTRAP_SIGNING_KEY;
  process.env.NEXT_PUBLIC_SPACETIME_ENDPOINT = ORIGINAL_SPACETIME_ENDPOINT;
});

describe('app service composition', () => {
  test('seeds local fixture documents only on the explicit local default path', async () => {
    const { createAppService } = await loadAppServiceModule();
    process.env.NEXT_PUBLIC_APP_ENV = 'local';

    const localApp = createAppService({
      authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(),
    });

    expect((await localApp.listQuizSummaries(actor)).length).toBeGreaterThan(0);

    process.env.NEXT_PUBLIC_APP_ENV = 'preview';

    const previewApp = createAppService({
      authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(),
    });

    await expect(previewApp.listQuizSummaries(actor)).resolves.toEqual([]);
  });

  test('exposes operator readiness without requiring the runtime bootstrap path to initialize eagerly', async () => {
    const { createAppService, getAppOperationalReadiness } = await loadAppServiceModule();
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    delete process.env.SPACETIME_DATABASE;
    delete process.env.SPACETIME_ADMIN_TOKEN;
    delete process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY;
    delete process.env.NEXT_PUBLIC_SPACETIME_ENDPOINT;

    const app = createAppService({
      authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(),
    });

    expect((await app.listQuizSummaries(actor)).length).toBeGreaterThan(0);
    expect(getAppOperationalReadiness()).toMatchObject({
      canBootstrapRooms: false,
      runtime: {
        canCreateRooms: false,
        canIssueHostClaims: false,
      },
    });
  });
});