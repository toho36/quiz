/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDirectories: string[] = [];

afterEach(() => {
  mock.restore();

  while (tempDirectories.length > 0) {
    rmSync(tempDirectories.pop()!, { force: true, recursive: true });
  }
});

function createTempDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'quiz-authoring-'));
  tempDirectories.push(directory);
  return join(directory, 'authoring.sqlite');
}

async function loadDemoAppServiceModule() {
  mock.module('server-only', () => ({}));
  return import('@/lib/server/demo-app-service');
}

async function loadAuthoringSqliteStoreModule() {
  mock.module('server-only', () => ({}));
  return import('@/lib/server/authoring-sqlite-store');
}

describe('SQLite authoring persistence', () => {
  test('persists authoring edits and publish state across service instances', async () => {
    const databasePath = createTempDatabasePath();
    const { createDemoAppService, demoAuthorActor } = await loadDemoAppServiceModule();

    const firstApp = createDemoAppService({
      authoringDatabasePath: databasePath,
      clock: () => new Date('2026-03-07T12:00:00.000Z'),
    });

    const draftQuiz = firstApp.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'draft');

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
      authoringDatabasePath: databasePath,
      clock: () => new Date('2026-03-07T12:05:00.000Z'),
    });

    const summaries = secondApp.listQuizSummaries(demoAuthorActor);
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

  test('runs authoring migrations idempotently', async () => {
    const databasePath = createTempDatabasePath();
    const { createSqliteAuthoringStore, runAuthoringSqliteMigrations } = await loadAuthoringSqliteStoreModule();

    const firstRun = runAuthoringSqliteMigrations(databasePath);
    const secondRun = runAuthoringSqliteMigrations(databasePath);
    const store = createSqliteAuthoringStore({ databasePath, seedDocuments: [] });

    expect(firstRun.appliedMigrations).toEqual(['0001_authoring_quizzes.sql']);
    expect(secondRun.appliedMigrations).toEqual([]);
    expect(store.listQuizSummaries({ clerkUserId: 'user-1' })).toEqual([]);
  });
});