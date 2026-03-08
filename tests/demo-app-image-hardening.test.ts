/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { createDemoSeedQuizDocuments } from '@/lib/server/demo-seed';
import { createDemoAppService } from '@/lib/server/demo-app-service';
import type { QuizImageStore } from '@/lib/server/quiz-image-store';
import { InvalidOperationError, NotFoundError } from '@/lib/server/service-errors';
import { createInMemoryAuthoringSpacetimeClientFactory } from '@/tests/support/in-memory-authoring-spacetime';
import { createInMemoryRuntimeBootstrapProvisioner } from '@/tests/support/in-memory-runtime-bootstrap';

const hostTransportSessionId = 'host-session-image';
const authorActor = { clerkUserId: 'user-1', clerkSessionId: 'session-1' };
const PNG_1X1_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
  0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x04, 0x00, 0x00, 0x00, 0xb5, 0x1c, 0x0c, 0x02, 0x00, 0x00, 0x00,
  0x0b, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0xfc, 0xff, 0x1f, 0x00, 0x03, 0x03, 0x02, 0x00, 0xef, 0xef,
  0x65, 0x5f, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function createImageFile(name: string, type: string, bytes = PNG_1X1_BYTES) {
  return new File([bytes], name, { type });
}

function createQuotaLockRunner() {
  let quotaLock = Promise.resolve();
  return async function runWithQuotaLock<T>(operation: () => Promise<T>) {
    const previous = quotaLock;
    let release!: () => void;
    quotaLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  };
}

function createTrackingQuizImageStore() {
  const objects = new Map<string, { bytes: number; content_type: 'image/png' | 'image/jpeg' | 'image/webp'; data: Uint8Array }>();
  const deletedObjectKeys: string[] = [];
  const putObjectKeys: string[] = [];
  const store: QuizImageStore = {
    async getObject({ objectKey }) {
      const current = objects.get(objectKey);
      return current ? { ...current, data: new Uint8Array(current.data) } : null;
    },
    async getStoredBytes() {
      return [...objects.values()].reduce((total, entry) => total + entry.bytes, 0);
    },
    async putObject({ objectKey, contentType, data }) {
      putObjectKeys.push(objectKey);
      objects.set(objectKey, { bytes: data.byteLength, content_type: contentType, data: new Uint8Array(data) });
    },
    async deleteObject({ objectKey }) {
      deletedObjectKeys.push(objectKey);
      objects.delete(objectKey);
    },
    runWithQuotaLock: createQuotaLockRunner(),
  };
  return { store, objects, deletedObjectKeys, putObjectKeys };
}

function createSeededImageDocuments() {
  const seedDocuments = createDemoSeedQuizDocuments();
  const publishedQuiz = seedDocuments.find((document) => document.quiz.quiz_id === 'quiz-1');
  expect(publishedQuiz).toBeDefined();
  const questionImage = {
    storage_provider: 'cloudflare_r2' as const,
    object_key: 'quiz-images/quiz-1/questions/question-1/seed-question.png',
    bytes: PNG_1X1_BYTES.byteLength,
    content_type: 'image/png' as const,
    width: 1,
    height: 1,
  };
  const optionImage = {
    storage_provider: 'cloudflare_r2' as const,
    object_key: 'quiz-images/quiz-1/options/option-1/seed-option.png',
    bytes: PNG_1X1_BYTES.byteLength,
    content_type: 'image/png' as const,
    width: 1,
    height: 1,
  };
  publishedQuiz!.questions[0]!.question.image = questionImage;
  publishedQuiz!.questions[0]!.options[0]!.image = optionImage;
  return { seedDocuments, questionImage, optionImage };
}

function createTestApp(overrides: Parameters<typeof createDemoAppService>[0] = {}) {
  process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY = 'test-signing-key';
  const seedDocuments = overrides.seedDocuments ?? createDemoSeedQuizDocuments();
  return createDemoAppService({
    authoringClientFactory: createInMemoryAuthoringSpacetimeClientFactory(seedDocuments),
    runtimeProvisioner: createInMemoryRuntimeBootstrapProvisioner(seedDocuments),
    seedDocuments,
    ...overrides,
  });
}

async function getPublishedQuiz(app: ReturnType<typeof createDemoAppService>) {
  const publishedQuiz = (await app.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'published');
  expect(publishedQuiz).toBeDefined();
  return publishedQuiz!;
}

async function createPublishedQuizRoom(app: ReturnType<typeof createDemoAppService>, quizId: string) {
  const room = await app.createRoom({ actor: authorActor, quizId });
  app.claimHost({ actor: authorActor, roomCode: room.room_code, hostClaimToken: room.host_claim_token, transportSessionId: hostTransportSessionId });
  return room;
}

describe('demo app image hardening', () => {
  test('keeps quiz documents and runtime state reference-only while allowing authorized image reads', async () => {
    const { store, objects } = createTrackingQuizImageStore();
    const { seedDocuments, questionImage, optionImage } = createSeededImageDocuments();
    objects.set(questionImage.object_key, { bytes: questionImage.bytes, content_type: 'image/png', data: PNG_1X1_BYTES });
    objects.set(optionImage.object_key, { bytes: optionImage.bytes, content_type: 'image/png', data: PNG_1X1_BYTES });
    const app = createTestApp({ clock: () => new Date('2026-03-06T12:05:00.000Z'), quizImageStore: store, seedDocuments });
    const publishedQuiz = await getPublishedQuiz(app);
    const room = await createPublishedQuizRoom(app, publishedQuiz.quiz_id);
    await app.joinRoom({ guestSessionId: 'guest-image', roomCode: room.room_code, displayName: 'Player Image' });
    const hostState = app.performHostAction({ actor: authorActor, roomCode: room.room_code, action: 'start_game', transportSessionId: hostTransportSessionId });
    const playerState = app.getPlayerRoomState({ guestSessionId: 'guest-image', roomCode: room.room_code });
    const hostAsset = await app.readHostRuntimeQuizImageAsset({ actor: authorActor, roomCode: room.room_code, objectKey: questionImage.object_key });
    const playerAsset = await app.readPlayerRuntimeQuizImageAsset({ guestSessionId: 'guest-image', roomCode: room.room_code, objectKey: optionImage.object_key });

    expect(hostAsset.data).toEqual(PNG_1X1_BYTES);
    expect(playerAsset.data).toEqual(PNG_1X1_BYTES);
    expect('data' in ((hostState.active_question?.image ?? {}) as Record<string, unknown>)).toBe(false);
    expect('data' in ((playerState.active_question?.display_options[0]?.image ?? {}) as Record<string, unknown>)).toBe(false);
  });

  test('replaces and removes unreferenced authoring image objects', async () => {
    const { store, objects, deletedObjectKeys } = createTrackingQuizImageStore();
    const app = createTestApp({ clock: () => new Date('2026-03-06T12:05:00.000Z'), quizImageStore: store });
    const publishedQuiz = await getPublishedQuiz(app);

    const firstUpload = await app.uploadQuestionImage({ actor: authorActor, quizId: publishedQuiz.quiz_id, questionId: 'question-1', file: createImageFile('question-first.png', 'image/png') });
    const firstObjectKey = firstUpload.questions[0].question.image!.object_key;
    const replacementUpload = await app.uploadQuestionImage({ actor: authorActor, quizId: publishedQuiz.quiz_id, questionId: 'question-1', file: createImageFile('question-second.png', 'image/png', Uint8Array.from([...PNG_1X1_BYTES, 0x00])) });

    expect(replacementUpload.questions[0].question.image!.object_key).not.toBe(firstObjectKey);
    expect(deletedObjectKeys).toContain(firstObjectKey);
    expect(objects.has(firstObjectKey)).toBe(false);
    await expect(app.readAuthoringQuizImageAsset({ actor: authorActor, quizId: publishedQuiz.quiz_id, objectKey: firstObjectKey })).rejects.toBeInstanceOf(NotFoundError);

    const optionUpload = await app.uploadOptionImage({ actor: authorActor, quizId: publishedQuiz.quiz_id, questionId: 'question-1', optionId: 'option-2', file: createImageFile('option.png', 'image/png') });
    const optionObjectKey = optionUpload.questions[0].options[1]!.image!.object_key;
    await app.removeOptionImage({ actor: authorActor, quizId: publishedQuiz.quiz_id, questionId: 'question-1', optionId: 'option-2' });
    await app.removeQuestionImage({ actor: authorActor, quizId: publishedQuiz.quiz_id, questionId: 'question-1' });

    expect(deletedObjectKeys).toEqual(expect.arrayContaining([optionObjectKey, replacementUpload.questions[0].question.image!.object_key]));
  });

  test('defers reclaiming replaced objects until the room is no longer readable', async () => {
    let currentTime = new Date('2026-03-06T12:05:00.000Z');
    const { store, objects, deletedObjectKeys } = createTrackingQuizImageStore();
    const { seedDocuments, questionImage } = createSeededImageDocuments();
    objects.set(questionImage.object_key, { bytes: questionImage.bytes, content_type: 'image/png', data: PNG_1X1_BYTES });
    const app = createTestApp({ clock: () => currentTime, quizImageStore: store, seedDocuments });
    const publishedQuiz = await getPublishedQuiz(app);
    const firstObjectKey = questionImage.object_key;
    const room = await createPublishedQuizRoom(app, publishedQuiz.quiz_id);
    app.performHostAction({ actor: authorActor, roomCode: room.room_code, action: 'start_game', transportSessionId: hostTransportSessionId });
    await app.uploadQuestionImage({ actor: authorActor, quizId: publishedQuiz.quiz_id, questionId: 'question-1', file: createImageFile('question-second.png', 'image/png', Uint8Array.from([...PNG_1X1_BYTES, 0x00])) });
    app.performHostAction({ actor: authorActor, roomCode: room.room_code, action: 'abort_game', transportSessionId: hostTransportSessionId });

    expect(deletedObjectKeys).not.toContain(firstObjectKey);

    currentTime = new Date('2026-03-06T12:36:00.000Z');
    expect(app.getHostRoomState({ actor: authorActor, roomCode: room.room_code, transportSessionId: hostTransportSessionId }).shared_room.lifecycle_state).toBe('expired');
    await app.uploadOptionImage({ actor: authorActor, quizId: publishedQuiz.quiz_id, questionId: 'question-1', optionId: 'option-1', file: createImageFile('option-after-expiry.png', 'image/png') });

    expect(deletedObjectKeys).toContain(firstObjectKey);
    expect(objects.has(firstObjectKey)).toBe(false);
  });

  test('rejects invalid uploads, enforces quota, and rolls back failed document saves', async () => {
    const { store, objects, deletedObjectKeys, putObjectKeys } = createTrackingQuizImageStore();
    const app = createTestApp({ clock: () => new Date('2026-03-06T12:05:00.000Z'), quizImageStore: store, saveQuizDocumentOverride: async () => { throw new Error('simulated quiz save failure'); } });
    const publishedQuiz = await getPublishedQuiz(app);

    await expect(app.uploadQuestionImage({ actor: authorActor, quizId: publishedQuiz.quiz_id, questionId: 'question-1', file: createImageFile('question.gif', 'image/gif') })).rejects.toThrow('Only PNG, JPEG, and WebP images are supported.');
    await expect(app.uploadQuestionImage({ actor: authorActor, quizId: publishedQuiz.quiz_id, questionId: 'question-1', file: new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'question.png', { type: 'image/png' }) })).rejects.toThrow('Images must be 5 MiB or smaller.');
    await expect(app.uploadQuestionImage({ actor: authorActor, quizId: publishedQuiz.quiz_id, questionId: 'question-1', file: createImageFile('question.png', 'image/png') })).rejects.toThrow('simulated quiz save failure');

    expect(putObjectKeys).toHaveLength(1);
    expect(deletedObjectKeys).toEqual([putObjectKeys[0]!]);
    expect(objects.has(putObjectKeys[0]!)).toBe(false);

    let quotaPutCalls = 0;
    const quotaApp = createTestApp({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
      quizImageStore: {
        async getObject() { return null; },
        async getStoredBytes() { return 8 * 1024 * 1024 * 1024 - 10; },
        async putObject() { quotaPutCalls += 1; },
        async deleteObject() { throw new Error('not used'); },
        async runWithQuotaLock(operation) { return operation(); },
      },
    });
    const quotaQuiz = (await quotaApp.listQuizSummaries(authorActor)).find((quiz) => quiz.status === 'published');
    await expect(quotaApp.uploadQuestionImage({ actor: authorActor, quizId: quotaQuiz!.quiz_id, questionId: 'question-1', file: createImageFile('quota.png', 'image/png') })).rejects.toThrow('Quiz image storage is full. Uploading this file would exceed the 8 GiB limit.');
    expect(quotaPutCalls).toBe(0);
  });
});