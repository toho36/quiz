/// <reference types="bun-types" />

import { describe, expect, mock, test } from 'bun:test';

async function loadDemoAppServiceModule() {
  mock.module('server-only', () => ({}));
  return import('@/lib/server/demo-app-service');
}

async function loadAuthoringSpacetimeStoreModule() {
  mock.module('server-only', () => ({}));
  return import('@/lib/server/authoring-spacetimedb-store');
}

async function loadInMemorySupportModule() {
  mock.module('server-only', () => ({}));
  return import('@/tests/support/in-memory-authoring-spacetime');
}

describe('SpacetimeDB authoring persistence', () => {
  test('persists authoring edits and publish state across service instances', async () => {
    const { createDemoAppService, demoAuthorActor } = await loadDemoAppServiceModule();
    const { createInMemoryAuthoringSpacetimeClientFactory } = await loadInMemorySupportModule();
    const authoringClientFactory = createInMemoryAuthoringSpacetimeClientFactory();

    const firstApp = createDemoAppService({
      authoringClientFactory,
      clock: () => new Date('2026-03-07T12:00:00.000Z'),
    });

    const draftQuiz = (await firstApp.listQuizSummaries(demoAuthorActor)).find((quiz) => quiz.status === 'draft');

    expect(draftQuiz).toBeDefined();

    await firstApp.saveQuizDetails({
      actor: demoAuthorActor,
      quizId: draftQuiz!.quiz_id,
      title: 'Persisted draft title',
      description: 'Stored through SQLite.',
    });

    await firstApp.publishQuiz({
      actor: demoAuthorActor,
      quizId: draftQuiz!.quiz_id,
    });

    const secondApp = createDemoAppService({
      authoringClientFactory,
      clock: () => new Date('2026-03-07T12:05:00.000Z'),
    });

    const summaries = await secondApp.listQuizSummaries(demoAuthorActor);
    const persistedQuiz = summaries.find((quiz) => quiz.quiz_id === draftQuiz!.quiz_id);
    const persistedDocument = await secondApp.loadQuizDocument({ actor: demoAuthorActor, quizId: draftQuiz!.quiz_id });

    expect(persistedQuiz).toMatchObject({
      quiz_id: draftQuiz!.quiz_id,
      title: 'Persisted draft title',
      status: 'published',
      question_count: 2,
      updated_at: '2026-03-07T12:00:00.000Z',
    });
    expect(persistedDocument.quiz.description).toBe('Stored through SQLite.');
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