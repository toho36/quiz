/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';

const ORIGINAL_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;

const authorActor = {
  clerkUserId: 'user-1',
  clerkSessionId: 'session-1',
};

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

    onConnectError() {
      return this;
    }

    onDisconnect() {
      return this;
    }

    build() {
      return {};
    }
  }

  mock.module('spacetimedb', () => ({
    DbConnectionBuilder: MockDbConnectionBuilder,
    DbConnectionImpl: MockDbConnectionImpl,
    procedureSchema: () => ({}),
    procedures: () => ({}),
    reducers: () => ({ reducersType: { reducers: {} } }),
    schema: () => ({ schemaType: { tables: {} } }),
    t: new Proxy(
      {},
      {
        get: (_target, property) => (...args: unknown[]) => ({ property, args }),
      },
    ),
  }));
}

async function loadAppServiceModule() {
  mock.module('server-only', () => ({}));
  installSpacetimeDbMock();
  return import('@/lib/server/app-service');
}

async function loadAuthoringSpacetimeStoreModule() {
  mock.module('server-only', () => ({}));
  installSpacetimeDbMock();
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
  test('persists question and option authoring edits across default app-service instances', async () => {
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

    const withAddedQuestion = await firstApp.addQuestion({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
    });
    const createdQuestion = withAddedQuestion.questions.at(-1);

    expect(createdQuestion).toBeDefined();

    await firstApp.saveQuestion({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
      questionId: createdQuestion!.question.question_id,
      prompt: 'Persisted extra question',
      questionType: 'single_choice',
      basePoints: 175,
      timeLimitSeconds: 50,
      shuffleAnswers: false,
      options: [
        { optionId: createdQuestion!.options[0]!.option_id, text: 'Yes', isCorrect: true },
        { optionId: createdQuestion!.options[1]!.option_id, text: 'No', isCorrect: false },
      ],
    });

    const withAddedOption = await firstApp.addOption({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
      questionId: 'draft-question-1',
    });
    const editableQuestion = withAddedOption.questions.find((entry) => entry.question.question_id === 'draft-question-1');
    const createdOption = editableQuestion?.options.at(-1);

    expect(createdOption).toBeDefined();

    await firstApp.saveQuestion({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
      questionId: 'draft-question-1',
      prompt: 'Persisted updated question prompt',
      questionType: 'single_choice',
      basePoints: 110,
      timeLimitSeconds: 20,
      shuffleAnswers: true,
      options: [
        { optionId: editableQuestion!.options[0]!.option_id, text: 'Four', isCorrect: true },
        { optionId: editableQuestion!.options[1]!.option_id, text: 'Five', isCorrect: false },
        { optionId: createdOption!.option_id, text: 'Twenty-two', isCorrect: false },
      ],
    });

    await firstApp.moveOption({
      actor: authorActor,
      quizId: draftQuiz!.quiz_id,
      questionId: 'draft-question-1',
      optionId: createdOption!.option_id,
      direction: 'up',
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
      question_count: 3,
      updated_at: '2026-03-07T12:00:00.000Z',
    });
    expect(persistedDocument.quiz.description).toBe('Stored through SpacetimeDB.');
    expect(persistedDocument.quiz.published_at).toBe('2026-03-07T12:00:00.000Z');
    expect(persistedDocument.questions.some((entry) => entry.question.prompt === 'Persisted extra question')).toBe(true);
    expect(
      persistedDocument.questions.find((entry) => entry.question.question_id === 'draft-question-1')?.options[1]?.text,
    ).toBe('Twenty-two');
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