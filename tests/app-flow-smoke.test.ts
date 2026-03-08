import { describe, expect, test } from 'bun:test';
import { AuthorizationError, InvalidOperationError, NotFoundError } from '@/lib/server/service-errors';
import { createDemoAppService, demoAuthorActor } from '@/lib/server/demo-app-service';
import type { QuizImageStore } from '@/lib/server/quiz-image-store';

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

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
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
      objects.set(objectKey, {
        bytes: data.byteLength,
        content_type: contentType,
        data: new Uint8Array(data),
      });
    },
    async deleteObject({ objectKey }) {
      deletedObjectKeys.push(objectKey);
      objects.delete(objectKey);
    },
    runWithQuotaLock: createQuotaLockRunner(),
  };
  return { store, objects, deletedObjectKeys, putObjectKeys };
}

const questionImageFixture = {
  storage_provider: 'cloudflare_r2',
  object_key: 'quiz-images/quiz-1/question-1/image.png',
  content_type: 'image/png',
  bytes: 256_000,
  width: 1200,
  height: 800,
} as const;

const optionImageFixture = {
  ...questionImageFixture,
  object_key: 'quiz-images/quiz-1/question-1/option-1.webp',
  content_type: 'image/webp',
  bytes: 128_000,
  width: 640,
  height: 640,
} as const;

describe('initial application flow smoke', () => {
  test('keeps lobby rooms joinable for the documented pre-start window', async () => {
    let currentTime = new Date('2026-03-06T12:00:00.000Z');
    const app = createDemoAppService({
      clock: () => currentTime,
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    currentTime = new Date('2026-03-06T15:00:00.000Z');

    await app.joinRoom({
      guestSessionId: 'guest-late-lobby',
      roomCode: room.room_code,
      displayName: 'Patient Player',
    });

    const playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-late-lobby',
      roomCode: room.room_code,
    });

    expect(playerState.shared_room.lifecycle_state).toBe('lobby');
    expect(playerState.self.display_name).toBe('Patient Player');
  });

  test('freezes the latest published quiz content when gameplay starts', async () => {
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    await app.joinRoom({
      guestSessionId: 'guest-image-state',
      roomCode: room.room_code,
      displayName: 'Player Image State',
    });

    const currentDocument = await app.loadQuizDocument({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    await app.saveQuizDocument({
      actor: demoAuthorActor,
      document: {
        ...currentDocument,
        questions: currentDocument.questions.map((entry, index) =>
          index === 0
            ? {
                ...entry,
                question: {
                  ...entry.question,
                  prompt: 'What is 2 + 3?',
                  image: questionImageFixture,
                },
                options: entry.options.map((option) =>
                  option.option_id === 'option-1'
                    ? {
                        ...option,
                        text: '5',
                        image: optionImageFixture,
                      }
                    : option,
                ),
              }
            : entry,
        ),
      },
    });

    const hostState = app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'start_game',
    });
    const playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-image-state',
      roomCode: room.room_code,
    });

    expect(hostState.active_question?.prompt).toBe('What is 2 + 3?');
    expect(hostState.active_question?.image).toEqual(questionImageFixture);
    expect(hostState.active_question?.display_options.map((option) => option.text)).toContain('5');
    expect(hostState.active_question?.display_options.find((option) => option.option_id === 'option-1')?.image).toEqual(optionImageFixture);
    expect(playerState.active_question?.image).toEqual(questionImageFixture);
    expect(playerState.active_question?.display_options.find((option) => option.option_id === 'option-1')?.image).toEqual(optionImageFixture);
  });

  test('reads uploaded runtime image bytes for the authorized host and player while keeping room state reference-only', async () => {
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');
    expect(publishedQuiz).toBeDefined();

    const questionUpload = await app.uploadQuestionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      file: createImageFile('runtime-question.png', 'image/png'),
    });
    const optionUpload = await app.uploadOptionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      optionId: 'option-1',
      file: createImageFile('runtime-option.png', 'image/png'),
    });

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    await app.joinRoom({
      guestSessionId: 'guest-runtime-image',
      roomCode: room.room_code,
      displayName: 'Player Runtime Image',
    });

    const hostState = app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'start_game',
    });

    const hostAsset = await app.readHostRuntimeQuizImageAsset({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      objectKey: questionUpload.questions[0].question.image!.object_key,
    });
    const playerAsset = await app.readPlayerRuntimeQuizImageAsset({
      guestSessionId: 'guest-runtime-image',
      roomCode: room.room_code,
      objectKey: optionUpload.questions[0].options[0]!.image!.object_key,
    });
    const playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-runtime-image',
      roomCode: room.room_code,
    });
    const hostOptionImage = hostState.active_question?.display_options.find((option) => option.option_id === 'option-1')?.image;
    const playerOptionImage = playerState.active_question?.display_options.find((option) => option.option_id === 'option-1')?.image;

    expect(hostAsset.data).toEqual(PNG_1X1_BYTES);
    expect(playerAsset.data).toEqual(PNG_1X1_BYTES);
    expect('data' in (hostState.active_question?.image as Record<string, unknown>)).toBe(false);
    expect('data' in (hostOptionImage as Record<string, unknown>)).toBe(false);
    expect('data' in (playerState.active_question?.image as Record<string, unknown>)).toBe(false);
    expect('data' in (playerOptionImage as Record<string, unknown>)).toBe(false);
  });

  test('uploads question and option images through the authoring boundary while keeping raw bytes outside quiz documents', async () => {
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');
    expect(publishedQuiz).toBeDefined();

    const questionUpload = await app.uploadQuestionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      file: createImageFile('question.png', 'image/png'),
    });
    const questionRef = questionUpload.questions[0].question.image;

    expect(questionRef).toMatchObject({
      storage_provider: 'cloudflare_r2',
      content_type: 'image/png',
      width: 1,
      height: 1,
      bytes: PNG_1X1_BYTES.byteLength,
    });
    expect('data' in (questionUpload.questions[0].question.image as Record<string, unknown>)).toBe(false);

    const storedQuestionAsset = await app.readAuthoringQuizImageAsset({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      objectKey: questionRef!.object_key,
    });
    expect(storedQuestionAsset.data).toEqual(PNG_1X1_BYTES);

    const optionUpload = await app.uploadOptionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      optionId: 'option-2',
      file: createImageFile('option.png', 'image/png'),
    });

    expect(optionUpload.questions[0].options[1]?.image).toMatchObject({
      storage_provider: 'cloudflare_r2',
      content_type: 'image/png',
      width: 1,
      height: 1,
    });
    expect('data' in (optionUpload.questions[0].options[1]?.image as Record<string, unknown>)).toBe(false);
  });

  test('replaces and removes authoring image references without leaving them readable from the quiz document', async () => {
    const { store, objects, deletedObjectKeys } = createTrackingQuizImageStore();
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
      quizImageStore: store,
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');
    expect(publishedQuiz).toBeDefined();

    const firstQuestionUpload = await app.uploadQuestionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      file: createImageFile('question-first.png', 'image/png'),
    });
    const firstObjectKey = firstQuestionUpload.questions[0].question.image!.object_key;

    const replacementQuestionUpload = await app.uploadQuestionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      file: createImageFile('question-second.png', 'image/png', Uint8Array.from([...PNG_1X1_BYTES, 0x00])),
    });
    expect(replacementQuestionUpload.questions[0].question.image!.object_key).not.toBe(firstObjectKey);
    expect(deletedObjectKeys).toContain(firstObjectKey);
    expect(objects.has(firstObjectKey)).toBe(false);
    await expect(
      app.readAuthoringQuizImageAsset({ actor: demoAuthorActor, quizId: publishedQuiz!.quiz_id, objectKey: firstObjectKey }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await app.uploadOptionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      optionId: 'option-2',
      file: createImageFile('option-first.png', 'image/png'),
    });
    const replacementQuestionObjectKey = replacementQuestionUpload.questions[0].question.image!.object_key;
    const optionObjectKey = (await app.loadQuizDocument({ actor: demoAuthorActor, quizId: publishedQuiz!.quiz_id })).questions[0].options[1]!.image!
      .object_key;
    const optionDocument = await app.removeOptionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      optionId: 'option-2',
    });
    expect(optionDocument.questions[0].options[1]?.image).toBeUndefined();
    expect(deletedObjectKeys).toContain(optionObjectKey);
    expect(objects.has(optionObjectKey)).toBe(false);
    await expect(
      app.readAuthoringQuizImageAsset({ actor: demoAuthorActor, quizId: publishedQuiz!.quiz_id, objectKey: optionObjectKey }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const questionDocument = await app.removeQuestionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
    });
    expect(questionDocument.questions[0].question.image).toBeUndefined();
    expect(deletedObjectKeys).toContain(replacementQuestionObjectKey);
    expect(objects.has(replacementQuestionObjectKey)).toBe(false);
    await expect(
      app.readAuthoringQuizImageAsset({ actor: demoAuthorActor, quizId: publishedQuiz!.quiz_id, objectKey: replacementQuestionObjectKey }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test('keeps replaced image objects when a started room still references them', async () => {
    const { store, deletedObjectKeys } = createTrackingQuizImageStore();
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
      quizImageStore: store,
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');
    expect(publishedQuiz).toBeDefined();

    const firstUpload = await app.uploadQuestionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      file: createImageFile('question-first.png', 'image/png'),
    });
    const firstObjectKey = firstUpload.questions[0].question.image!.object_key;

    const room = await app.createRoom({ actor: demoAuthorActor, quizId: publishedQuiz!.quiz_id });
    app.performHostAction({ actor: demoAuthorActor, roomCode: room.room_code, action: 'start_game' });

    await app.uploadQuestionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      file: createImageFile('question-second.png', 'image/png', Uint8Array.from([...PNG_1X1_BYTES, 0x00])),
    });

    expect(deletedObjectKeys).not.toContain(firstObjectKey);

    const runtimeAsset = await app.readHostRuntimeQuizImageAsset({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      objectKey: firstObjectKey,
    });
    expect(runtimeAsset.data).toEqual(PNG_1X1_BYTES);
  });

  test('reclaims deferred question image objects after an aborted room is no longer readable', async () => {
    let currentTime = new Date('2026-03-06T12:05:00.000Z');
    const { store, objects, deletedObjectKeys } = createTrackingQuizImageStore();
    const app = createDemoAppService({
      clock: () => currentTime,
      quizImageStore: store,
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');
    expect(publishedQuiz).toBeDefined();

    const firstUpload = await app.uploadQuestionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      file: createImageFile('question-first.png', 'image/png'),
    });
    const firstObjectKey = firstUpload.questions[0].question.image!.object_key;

    const room = await app.createRoom({ actor: demoAuthorActor, quizId: publishedQuiz!.quiz_id });
    app.performHostAction({ actor: demoAuthorActor, roomCode: room.room_code, action: 'start_game' });

    await app.uploadQuestionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      file: createImageFile('question-second.png', 'image/png', Uint8Array.from([...PNG_1X1_BYTES, 0x00])),
    });

    app.performHostAction({ actor: demoAuthorActor, roomCode: room.room_code, action: 'abort_game' });

    currentTime = new Date('2026-03-06T12:34:00.000Z');
    expect(app.getHostRoomState({ actor: demoAuthorActor, roomCode: room.room_code }).shared_room.lifecycle_state).toBe('aborted');
    expect(deletedObjectKeys).not.toContain(firstObjectKey);
    expect(objects.has(firstObjectKey)).toBe(true);

    currentTime = new Date('2026-03-06T12:36:00.000Z');
    expect(() => app.getHostRoomState({ actor: demoAuthorActor, roomCode: room.room_code })).toThrow(InvalidOperationError);

    await app.uploadOptionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      optionId: 'option-1',
      file: createImageFile('option-after-expiry.png', 'image/png'),
    });

    expect(deletedObjectKeys).toContain(firstObjectKey);
    expect(objects.has(firstObjectKey)).toBe(false);
  });

  test('rejects unsupported or oversized authoring uploads with user-safe messages', async () => {
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');
    expect(publishedQuiz).toBeDefined();

    await expect(
      app.uploadQuestionImage({
        actor: demoAuthorActor,
        quizId: publishedQuiz!.quiz_id,
        questionId: 'question-1',
        file: createImageFile('question.gif', 'image/gif'),
      }),
    ).rejects.toThrow('Only PNG, JPEG, and WebP images are supported.');

    await expect(
      app.uploadQuestionImage({
        actor: demoAuthorActor,
        quizId: publishedQuiz!.quiz_id,
        questionId: 'question-1',
        file: new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'question.png', { type: 'image/png' }),
      }),
    ).rejects.toThrow('Images must be 5 MiB or smaller.');
  });

  test('rolls back the uploaded object when quiz save fails after a successful image write', async () => {
    const { store, objects, deletedObjectKeys, putObjectKeys } = createTrackingQuizImageStore();
    const saveFailure = new Error('simulated quiz save failure');
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
      quizImageStore: store,
      saveQuizDocumentOverride: async () => {
        throw saveFailure;
      },
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');
    expect(publishedQuiz).toBeDefined();

    await expect(
      app.uploadQuestionImage({
        actor: demoAuthorActor,
        quizId: publishedQuiz!.quiz_id,
        questionId: 'question-1',
        file: createImageFile('question.png', 'image/png'),
      }),
    ).rejects.toBe(saveFailure);

    expect(putObjectKeys).toHaveLength(1);
    expect(deletedObjectKeys).toEqual([putObjectKeys[0]!]);
    expect(objects.has(putObjectKeys[0]!)).toBe(false);

    const currentDocument = await app.loadQuizDocument({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });
    expect(currentDocument.questions[0]?.question.image).toBeUndefined();
  });

  test('rejects uploads that would exceed the 8 GiB stored-bytes cap before writing the object', async () => {
    let putCalls = 0;
    const store: QuizImageStore = {
      async getObject() {
        return null;
      },
      async getStoredBytes() {
        return 8 * 1024 * 1024 * 1024 - 10;
      },
      async putObject() {
        putCalls += 1;
      },
      async deleteObject() {
        throw new Error('not used');
      },
      async runWithQuotaLock(operation) {
        return operation();
      },
    };
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
      quizImageStore: store,
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');
    expect(publishedQuiz).toBeDefined();

    await expect(
      app.uploadQuestionImage({
        actor: demoAuthorActor,
        quizId: publishedQuiz!.quiz_id,
        questionId: 'question-1',
        file: createImageFile('question.png', 'image/png'),
      }),
    ).rejects.toThrow('Quiz image storage is full. Uploading this file would exceed the 8 GiB limit.');
    expect(putCalls).toBe(0);
  });

  test('serializes overlapping upload quota checks so only one near-cap write is accepted', async () => {
    const quotaLock = createQuotaLockRunner();
    const firstPutStarted = createDeferred();
    const releaseFirstPut = createDeferred();
    const objects = new Map<string, { bytes: number; content_type: 'image/png' | 'image/jpeg' | 'image/webp'; data: Uint8Array }>();
    let storedBytes = 8 * 1024 * 1024 * 1024 - PNG_1X1_BYTES.byteLength;
    let getStoredBytesCalls = 0;
    let putCalls = 0;

    const store: QuizImageStore = {
      async getObject({ objectKey }) {
        const current = objects.get(objectKey);
        return current ? { ...current, data: new Uint8Array(current.data) } : null;
      },
      async getStoredBytes() {
        getStoredBytesCalls += 1;
        return storedBytes;
      },
      async putObject({ objectKey, contentType, data }) {
        putCalls += 1;
        if (putCalls === 1) {
          firstPutStarted.resolve();
          await releaseFirstPut.promise;
        }
        objects.set(objectKey, {
          bytes: data.byteLength,
          content_type: contentType,
          data: new Uint8Array(data),
        });
        storedBytes += data.byteLength;
      },
      async deleteObject({ objectKey }) {
        const current = objects.get(objectKey);
        if (!current) {
          return;
        }
        storedBytes -= current.bytes;
        objects.delete(objectKey);
      },
      runWithQuotaLock: quotaLock,
    };

    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
      quizImageStore: store,
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');
    expect(publishedQuiz).toBeDefined();

    const firstUpload = app.uploadQuestionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      file: createImageFile('question.png', 'image/png'),
    });

    await firstPutStarted.promise;

    const secondUpload = app.uploadOptionImage({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
      questionId: 'question-1',
      optionId: 'option-1',
      file: createImageFile('option.png', 'image/png'),
    });

    await Promise.resolve();
    expect(getStoredBytesCalls).toBe(1);

    releaseFirstPut.resolve();

    const [firstResult, secondResult] = await Promise.allSettled([firstUpload, secondUpload]);

    expect(firstResult.status).toBe('fulfilled');
    expect(secondResult.status).toBe('rejected');
    expect(secondResult.status === 'rejected' ? secondResult.reason : null).toBeInstanceOf(InvalidOperationError);
    expect(secondResult.status === 'rejected' ? secondResult.reason.message : '').toBe(
      'Quiz image storage is full. Uploading this file would exceed the 8 GiB limit.',
    );

    expect(getStoredBytesCalls).toBe(2);
    expect(putCalls).toBe(1);
    expect(storedBytes).toBe(8 * 1024 * 1024 * 1024);
  });

  test('publishes a draft quiz and bootstraps a host room through the server boundary', async () => {
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:00:00.000Z'),
    });

    const draftQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'draft');

    expect(draftQuiz).toBeDefined();

    const saved = await app.saveQuizDetails({
      actor: demoAuthorActor,
      quizId: draftQuiz!.quiz_id,
      title: 'Launch Readiness Quiz',
      description: 'Updated through the authoring flow.',
    });

    expect(saved.quiz.title).toBe('Launch Readiness Quiz');
    expect(saved.quiz.status).toBe('draft');

    const published = await app.publishQuiz({
      actor: demoAuthorActor,
      quizId: draftQuiz!.quiz_id,
    });

    expect(published.quiz.status).toBe('published');

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: draftQuiz!.quiz_id,
    });

    const hostState = app.getHostRoomState({
      actor: demoAuthorActor,
      roomCode: room.room_code,
    });

    expect(hostState.shared_room.lifecycle_state).toBe('lobby');
    expect(hostState.allowed_actions).toEqual(['start_game', 'abort_game']);
    expect(hostState.shared_room.room_code).toBe(room.room_code);
  });

  test('joins, starts, submits, reveals, and shows the leaderboard through runtime logic', async () => {
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    await app.joinRoom({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
      displayName: 'Player One',
    });

    let playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
    });

    expect(playerState.shared_room.lifecycle_state).toBe('lobby');
    expect(playerState.self.display_name).toBe('Player One');

    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'start_game',
    });

    playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
    });

    expect(playerState.shared_room.lifecycle_state).toBe('in_progress');
    expect(playerState.active_question?.prompt).toContain('2 + 2');
    expect(playerState.active_question?.image).toBeUndefined();
    expect(playerState.active_question?.display_options.every((option) => option.image === undefined)).toBe(true);

    await app.submitAnswer({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
      selectedOptionIds: ['option-1'],
    });

    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'close_question',
    });
    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'reveal',
    });

    playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
    });

    expect(playerState.self.latest_outcome).toEqual({ is_correct: true, awarded_points: 100 });

    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'show_leaderboard',
    });

    playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
    });

    expect(playerState.leaderboard?.[0]).toMatchObject({
      display_name: 'Player One',
      score_total: 100,
      rank: 1,
    });

    expect(() =>
      app.joinRoom({
        guestSessionId: 'guest-2',
        roomCode: room.room_code,
        displayName: 'Late Player',
      }),
    ).toThrow(InvalidOperationError);
  });

  test('rotates reconnect tokens, rebinds authority, and rejects stale replay attempts', async () => {
    let currentTime = new Date('2026-03-06T12:05:00.000Z');
    const app = createDemoAppService({
      clock: () => currentTime,
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    const joined = app.joinRoom({
      guestSessionId: 'guest-1',
      roomCode: room.room_code,
      displayName: 'Player One',
    });

    expect(joined.roomId).toBe(room.room_id);
    expect(joined.resumeToken.length).toBeGreaterThan(20);
    expect(joined.resumeExpiresAt).toBe('2026-03-07T00:05:00.000Z');

    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'start_game',
    });

    currentTime = new Date('2026-03-06T12:05:10.000Z');

    const reconnected = app.reconnectPlayer({
      guestSessionId: 'guest-2',
      roomId: room.room_id,
      roomPlayerId: joined.roomPlayerId,
      resumeToken: joined.resumeToken,
    });

    expect(reconnected.roomCode).toBe(room.room_code);
    expect(reconnected.roomPlayerId).toBe(joined.roomPlayerId);
    expect(reconnected.resumeVersion).toBe(2);
    expect(reconnected.resumeToken).not.toBe(joined.resumeToken);
    expect(reconnected.resumeExpiresAt).toBe('2026-03-06T14:05:00.000Z');

    expect(app.findPlayerRoomState({ guestSessionId: 'guest-1', roomCode: room.room_code })).toBeNull();
    expect(() =>
      app.submitAnswer({
        guestSessionId: 'guest-1',
        roomCode: room.room_code,
        selectedOptionIds: ['option-1'],
      }),
    ).toThrow(AuthorizationError);

    const accepted = app.submitAnswer({
      guestSessionId: 'guest-2',
      roomCode: room.room_code,
      selectedOptionIds: ['option-1'],
    });

    expect(accepted.room_player_id).toBe(joined.roomPlayerId);

    let replayError: unknown;
    try {
      app.reconnectPlayer({
        guestSessionId: 'guest-3',
        roomId: room.room_id,
        roomPlayerId: joined.roomPlayerId,
        resumeToken: joined.resumeToken,
      });
    } catch (error) {
      replayError = error;
    }

    expect(replayError).toBeInstanceOf(InvalidOperationError);
    expect((replayError as Error).message).toBe('stale_resume_token');
  });

  test('emits minimum structured lifecycle logs without raw secrets', async () => {
    let currentTime = new Date('2026-03-06T12:05:00.000Z');
    const logs: Array<{ level: 'info' | 'error'; payload: Record<string, unknown> }> = [];
    const app = createDemoAppService({
      clock: () => currentTime,
      logger: {
        info(payload) {
          logs.push({ level: 'info', payload: { ...payload } });
        },
        error(payload) {
          logs.push({ level: 'error', payload: { ...payload } });
        },
      },
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    const joined = app.joinRoom({
      guestSessionId: 'guest-log-1',
      roomCode: room.room_code,
      displayName: 'Player Logger',
    });

    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'start_game',
    });

    currentTime = new Date('2026-03-06T12:05:10.000Z');

    const reconnected = app.reconnectPlayer({
      guestSessionId: 'guest-log-2',
      roomId: room.room_id,
      roomPlayerId: joined.roomPlayerId,
      resumeToken: joined.resumeToken,
    });

    let replayError: unknown;
    try {
      app.reconnectPlayer({
        guestSessionId: 'guest-log-3',
        roomId: room.room_id,
        roomPlayerId: joined.roomPlayerId,
        resumeToken: joined.resumeToken,
      });
    } catch (error) {
      replayError = error;
    }

    expect(replayError).toBeInstanceOf(InvalidOperationError);

    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'abort_game',
    });

    function findLog(event: string, level: 'info' | 'error', action?: string) {
      return logs.find(
        (entry) =>
          entry.level === level &&
          entry.payload.event === event &&
          (action === undefined || entry.payload.action === action),
      );
    }

    expect(findLog('demo.create_room', 'info')?.payload).toMatchObject({
      event: 'demo.create_room',
      environment: 'local',
      deployment_id: null,
      result: 'success',
      room_id: room.room_id,
      room_code: room.room_code,
      source_quiz_id: publishedQuiz!.quiz_id,
      clerk_user_id: demoAuthorActor.clerkUserId,
      lifecycle_state: 'lobby',
    });
    expect(findLog('demo.player_join', 'info')?.payload).toMatchObject({
      event: 'demo.player_join',
      result: 'success',
      room_id: room.room_id,
      room_code: room.room_code,
      room_player_id: joined.roomPlayerId,
      lifecycle_state: 'lobby',
      resume_version: 1,
    });
    expect(findLog('demo.room_lifecycle', 'info', 'start_game')?.payload).toMatchObject({
      event: 'demo.room_lifecycle',
      result: 'success',
      action: 'start_game',
      room_id: room.room_id,
      room_code: room.room_code,
      previous_lifecycle_state: 'lobby',
      lifecycle_state: 'in_progress',
      previous_question_phase: null,
      question_phase: 'question_open',
    });
    expect(findLog('demo.player_reconnect', 'info')?.payload).toMatchObject({
      event: 'demo.player_reconnect',
      result: 'success',
      room_id: room.room_id,
      room_code: room.room_code,
      room_player_id: joined.roomPlayerId,
      lifecycle_state: 'in_progress',
      resume_version: 2,
    });
    expect(findLog('demo.player_reconnect', 'error')?.payload).toMatchObject({
      event: 'demo.player_reconnect',
      result: 'error',
      room_id: room.room_id,
      room_code: room.room_code,
      room_player_id: joined.roomPlayerId,
      error_name: 'InvalidOperationError',
      error_message: 'stale_resume_token',
    });
    expect(findLog('demo.room_lifecycle', 'info', 'abort_game')?.payload).toMatchObject({
      event: 'demo.room_lifecycle',
      result: 'success',
      action: 'abort_game',
      previous_lifecycle_state: 'in_progress',
      lifecycle_state: 'aborted',
      room_id: room.room_id,
      room_code: room.room_code,
    });

    const serializedLogs = logs.map((entry) => JSON.stringify(entry.payload));

    expect(serializedLogs.some((entry) => entry.includes(joined.resumeToken))).toBe(false);
    expect(serializedLogs.some((entry) => entry.includes(reconnected.resumeToken))).toBe(false);
    expect(serializedLogs.some((entry) => entry.includes(room.host_claim_token))).toBe(false);
  });

  test('rejects duplicate join attempts from the same guest session instead of replaying a stored secret', async () => {
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    const joined = app.joinRoom({
      guestSessionId: 'guest-repeat',
      roomCode: room.room_code,
      displayName: 'Player Repeat',
    });

    expect(joined.resumeToken.length).toBeGreaterThan(20);

    expect(() =>
      app.joinRoom({
        guestSessionId: 'guest-repeat',
        roomCode: room.room_code,
        displayName: 'Player Repeat',
      }),
    ).toThrow(InvalidOperationError);
  });

  test('allows hosts to abort from lobby or gameplay and leaves the room read-only', async () => {
    const app = createDemoAppService({
      clock: () => new Date('2026-03-06T12:05:00.000Z'),
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const lobbyRoom = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    expect(app.getHostRoomState({ actor: demoAuthorActor, roomCode: lobbyRoom.room_code }).allowed_actions).toEqual([
      'start_game',
      'abort_game',
    ]);

    const abortedLobby = app.performHostAction({
      actor: demoAuthorActor,
      roomCode: lobbyRoom.room_code,
      action: 'abort_game',
    });

    expect(abortedLobby.shared_room.lifecycle_state).toBe('aborted');
    expect(abortedLobby.shared_room.question_index).toBeNull();
    expect(abortedLobby.shared_room.question_phase).toBeNull();
    expect(abortedLobby.allowed_actions).toEqual([]);

    const activeRoom = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    await app.joinRoom({
      guestSessionId: 'guest-abort',
      roomCode: activeRoom.room_code,
      displayName: 'Player Abort',
    });

    const started = app.performHostAction({
      actor: demoAuthorActor,
      roomCode: activeRoom.room_code,
      action: 'start_game',
    });

    expect(started.allowed_actions).toEqual(['close_question', 'abort_game']);

    const abortedActive = app.performHostAction({
      actor: demoAuthorActor,
      roomCode: activeRoom.room_code,
      action: 'abort_game',
    });

    expect(abortedActive.shared_room.lifecycle_state).toBe('aborted');
    expect(abortedActive.shared_room.question_index).toBeNull();
    expect(abortedActive.shared_room.question_phase).toBeNull();
    expect(abortedActive.active_question).toBeNull();
    expect(abortedActive.allowed_actions).toEqual([]);
    expect(abortedActive.leaderboard).toBeNull();

    const playerState = app.getPlayerRoomState({
      guestSessionId: 'guest-abort',
      roomCode: activeRoom.room_code,
    });

    expect(playerState.shared_room.lifecycle_state).toBe('aborted');
    expect(playerState.shared_room.question_index).toBeNull();
    expect(playerState.shared_room.question_phase).toBeNull();
    expect(playerState.active_question).toBeNull();
    expect(playerState.leaderboard).toBeNull();

    expect(() =>
      app.submitAnswer({
        guestSessionId: 'guest-abort',
        roomCode: activeRoom.room_code,
        selectedOptionIds: ['option-1'],
      }),
    ).toThrow(InvalidOperationError);
  });

  test('stops returning host and player room state after an aborted room passes its post-game expiry', async () => {
    let currentTime = new Date('2026-03-06T12:05:00.000Z');
    const app = createDemoAppService({
      clock: () => currentTime,
    });

    const publishedQuiz = app.listQuizSummaries(demoAuthorActor).find((quiz) => quiz.status === 'published');

    expect(publishedQuiz).toBeDefined();

    const room = await app.createRoom({
      actor: demoAuthorActor,
      quizId: publishedQuiz!.quiz_id,
    });

    await app.joinRoom({
      guestSessionId: 'guest-abort-expiry',
      roomCode: room.room_code,
      displayName: 'Expired Player',
    });

    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'start_game',
    });
    app.performHostAction({
      actor: demoAuthorActor,
      roomCode: room.room_code,
      action: 'abort_game',
    });

    currentTime = new Date('2026-03-06T12:36:00.000Z');

    expect(() =>
      app.getHostRoomState({
        actor: demoAuthorActor,
        roomCode: room.room_code,
      }),
    ).toThrow(InvalidOperationError);

    expect(() =>
      app.getPlayerRoomState({
        guestSessionId: 'guest-abort-expiry',
        roomCode: room.room_code,
      }),
    ).toThrow(InvalidOperationError);
  });
});