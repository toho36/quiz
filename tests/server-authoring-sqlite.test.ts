/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';

const ORIGINAL_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;

const authorActor = {
  clerkUserId: 'user-1',
  clerkSessionId: 'session-1',
};

async function loadAppServiceModule() {
  mock.module('server-only', () => ({}));
  return import('@/lib/server/app-service');
}

async function loadAuthoringSpacetimeStoreModule() {
  mock.module('server-only', () => ({}));
  return import('@/lib/server/authoring-spacetimedb-store');
}

async function loadInMemorySupportModule() {
  mock.module('server-only', () => ({}));
  return import('@/tests/support/in-memory-authoring-spacetime');
}

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_ENV = ORIGINAL_APP_ENV;
});

describe('SpacetimeDB authoring persistence', () => {
  test('persists authoring edits and publish state across default app-service instances', async () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'local';

    const { createAppService } = await loadAppServiceModule();
    const { createInMemoryAuthoringSpacetimeClientFactory } = await loadInMemorySupportModule();
    const authoringClientFactory = createInMemoryAuthoringSpacetimeClientFactory();

    const firstApp = createAppService({
      authoringClientFactory,
      clock: () => new Date('2026-03-07T12:00:00.000Z'),
    });

    const draftQuiz = (await firstApp.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'draft');

    expect(draftQuiz).toBeDefined();

    await firstApp.saveQuizDetails({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
      title: 'Persisted draft title',
      description: 'Stored through SpacetimeDB.',
    });

    await firstApp.publishQuiz({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
    });

    const secondApp = createAppService({
      authoringClientFactory,
      clock: () => new Date('2026-03-07T12:05:00.000Z'),
    });

    const summaries = await secondApp.listQuizSummaries(authorActor);
    const persistedQuiz = summaries.find((quiz) => quiz.quiz_id === draftQuiz!.quiz_id);
    const persistedDocument = await secondApp.loadQuizDocument({ actor: authorActor, quizId: draftQuiz!.quiz_id });

    expect(persistedQuiz).toMatchObject({
      quiz_id: draftQuiz!.quiz_id,
      title: 'Persisted draft title',
      status: 'published',
      question_count: 2,
      updated_at: '2026-03-07T12:00:00.000Z',
    });
    expect(persistedDocument.quiz.description).toBe('Stored through SpacetimeDB.');
    expect(persistedDocument.quiz.published_at).toBe('2026-03-07T12:00:00.000Z');
  });

  test('requires the Spacetime authoring env before creating a live store', async () => {
    const { getAuthoringSpacetimeEnvStatus, parseAuthoringSpacetimeConfig } = await loadAuthoringSpacetimeStoreModule();

    const status = getAuthoringSpacetimeEnvStatus({
      NEXT_PUBLIC_SPACETIME_ENDPOINT: 'https://maincloud.spacetimedb.com',
      SPACETIME_DATABASE: 'quiz-1j871',
      SPACETIME_ADMIN_TOKEN: '   ',
    });

    expect(status).toEqual({
      isConfigured: false,
      missingKeys: ['SPACETIME_ADMIN_TOKEN'],
    });
    expect(() =>
      parseAuthoringSpacetimeConfig({
        NEXT_PUBLIC_SPACETIME_ENDPOINT: 'https://maincloud.spacetimedb.com',
        SPACETIME_DATABASE: 'quiz-1j871',
        SPACETIME_ADMIN_TOKEN: '   ',
      }),
    ).toThrow('Authoring persistence requires: SPACETIME_ADMIN_TOKEN');
  });
});