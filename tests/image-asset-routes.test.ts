import { afterEach, describe, expect, mock, test } from 'bun:test';
import { NotFoundError } from '@/lib/server/service-errors';

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

afterEach(() => {
  mock.restore();
});

describe('quiz image routes', () => {
  test('authoring preview route streams bytes and maps the boundary response statuses', async () => {
    let actor: { clerkUserId: string; clerkSessionId: string } | null = { clerkUserId: 'user-1', clerkSessionId: 'session-1' };
    let mode: 'success' | 'not-found' | 'backend-failure' = 'success';
    const calls: Array<{ quizId: string; objectKey: string }> = [];

    mock.module('@/lib/server/demo-session', () => ({
      ensureDemoGuestSessionId: async () => 'guest-1',
      getDemoAuthorActor: async () => actor,
      getDemoGuestSessionId: async () => null,
      signInDemoAuthor: async () => {},
      signOutDemoAuthor: async () => {},
    }));
    mock.module('@/lib/server/demo-app-service', () => ({
      getDemoAppService: () => ({
        readAuthoringQuizImageAsset: async ({ quizId, objectKey }: { quizId: string; objectKey: string }) => {
          calls.push({ quizId, objectKey });
          if (mode === 'not-found') {
            throw new NotFoundError(`Image asset ${objectKey} was not found`);
          }
          if (mode === 'backend-failure') {
            throw new Error(`Cloudflare R2 get failed (500) for ${objectKey}.`);
          }
          return { data: PNG_BYTES, bytes: PNG_BYTES.byteLength, content_type: 'image/png' };
        },
      }),
    }));

    const { GET } = await import('@/app/(workspace)/authoring/assets/route');

    const success = await GET(
      new Request('https://example.test/authoring/assets?quizId=quiz-1&objectKey=quiz-images/quiz-1/question-1/image.png'),
    );
    expect(success.status).toBe(200);
    expect(success.headers.get('cache-control')).toBe('no-store');
    expect(success.headers.get('content-length')).toBe(String(PNG_BYTES.byteLength));
    expect(success.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await success.arrayBuffer())).toEqual(PNG_BYTES);

    actor = null;
    const forbidden = await GET(
      new Request('https://example.test/authoring/assets?quizId=quiz-1&objectKey=quiz-images/quiz-1/question-1/image.png'),
    );
    expect(forbidden.status).toBe(403);
    expect(await forbidden.text()).toBe('Sign in as the demo author to preview quiz images.');

    actor = { clerkUserId: 'user-1', clerkSessionId: 'session-1' };
    mode = 'not-found';
    const notFound = await GET(
      new Request('https://example.test/authoring/assets?quizId=quiz-1&objectKey=quiz-images/quiz-1/question-1/missing.png'),
    );
    expect(notFound.status).toBe(404);
    expect(await notFound.text()).toBe('Quiz image preview was not found.');

    mode = 'backend-failure';
    const backendFailure = await GET(
      new Request('https://example.test/authoring/assets?quizId=quiz-1&objectKey=quiz-images/quiz-1/question-1/secret.png'),
    );
    expect(backendFailure.status).toBe(500);
    const backendFailureText = await backendFailure.text();
    expect(backendFailureText).toBe('Could not load quiz image preview.');
    expect(backendFailureText).not.toContain('Cloudflare R2');
    expect(backendFailureText).not.toContain('secret.png');

    mode = 'success';
    const badRequest = await GET(new Request('https://example.test/authoring/assets?quizId=quiz-1'));
    expect(badRequest.status).toBe(400);
    expect(await badRequest.text()).toBe('Missing quizId or objectKey.');
    expect(calls).toEqual([
      { quizId: 'quiz-1', objectKey: 'quiz-images/quiz-1/question-1/image.png' },
      { quizId: 'quiz-1', objectKey: 'quiz-images/quiz-1/question-1/missing.png' },
      { quizId: 'quiz-1', objectKey: 'quiz-images/quiz-1/question-1/secret.png' },
    ]);
  });

  test('runtime asset route serves host/player bytes and keeps auth/not-found failures at the route boundary', async () => {
    let authorActor: { clerkUserId: string; clerkSessionId: string } | null = { clerkUserId: 'user-1', clerkSessionId: 'session-1' };
    let guestSessionId: string | null = 'guest-1';
    let playerMode: 'success' | 'not-found' | 'backend-failure' = 'success';
    const hostCalls: Array<{ roomCode: string; objectKey: string }> = [];
    const playerCalls: Array<{ roomCode: string; objectKey: string }> = [];

    mock.module('@/lib/server/demo-session', () => ({
      ensureDemoGuestSessionId: async () => 'guest-1',
      getDemoAuthorActor: async () => authorActor,
      getDemoGuestSessionId: async () => guestSessionId,
      signInDemoAuthor: async () => {},
      signOutDemoAuthor: async () => {},
    }));
    mock.module('@/lib/server/demo-app-service', () => ({
      getDemoAppService: () => ({
        readHostRuntimeQuizImageAsset: ({ roomCode, objectKey }: { roomCode: string; objectKey: string }) => {
          hostCalls.push({ roomCode, objectKey });
          return { data: PNG_BYTES, bytes: PNG_BYTES.byteLength, content_type: 'image/png' };
        },
        readPlayerRuntimeQuizImageAsset: ({ roomCode, objectKey }: { roomCode: string; objectKey: string }) => {
          playerCalls.push({ roomCode, objectKey });
          if (playerMode === 'not-found') {
            throw new NotFoundError(`Runtime image asset ${objectKey} was not found`);
          }
          if (playerMode === 'backend-failure') {
            throw new Error(`Cloudflare R2 get failed (500) for ${objectKey}.`);
          }
          return { data: PNG_BYTES, bytes: PNG_BYTES.byteLength, content_type: 'image/png' };
        },
      }),
    }));

    const { GET } = await import('@/app/runtime-assets/route');

    const hostResponse = await GET(
      new Request('https://example.test/runtime-assets?roomCode=ABCD12&objectKey=quiz-images/quiz-1/question-1/image.png&viewer=host'),
    );
    expect(hostResponse.status).toBe(200);
    expect(hostResponse.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await hostResponse.arrayBuffer())).toEqual(PNG_BYTES);

    const playerResponse = await GET(
      new Request('https://example.test/runtime-assets?roomCode=ABCD12&objectKey=quiz-images/quiz-1/question-1/option-1.png&viewer=player'),
    );
    expect(playerResponse.status).toBe(200);
    expect(playerResponse.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await playerResponse.arrayBuffer())).toEqual(PNG_BYTES);

    authorActor = null;
    const hostForbidden = await GET(
      new Request('https://example.test/runtime-assets?roomCode=ABCD12&objectKey=quiz-images/quiz-1/question-1/image.png&viewer=host'),
    );
    expect(hostForbidden.status).toBe(403);
    expect(await hostForbidden.text()).toBe('Sign in as the demo author to load host runtime quiz images.');

    authorActor = { clerkUserId: 'user-1', clerkSessionId: 'session-1' };
    guestSessionId = null;
    const playerForbidden = await GET(
      new Request('https://example.test/runtime-assets?roomCode=ABCD12&objectKey=quiz-images/quiz-1/question-1/option-1.png&viewer=player'),
    );
    expect(playerForbidden.status).toBe(403);
    expect(await playerForbidden.text()).toBe('Join the room before loading runtime quiz images.');

    guestSessionId = 'guest-1';
    playerMode = 'not-found';
    const notFound = await GET(
      new Request('https://example.test/runtime-assets?roomCode=ABCD12&objectKey=quiz-images/quiz-1/question-1/missing.png&viewer=player'),
    );
    expect(notFound.status).toBe(404);
    expect(await notFound.text()).toBe('Runtime quiz image was not found.');

    playerMode = 'backend-failure';
    const backendFailure = await GET(
      new Request('https://example.test/runtime-assets?roomCode=ABCD12&objectKey=quiz-images/quiz-1/question-1/secret.png&viewer=player'),
    );
    expect(backendFailure.status).toBe(500);
    const backendFailureText = await backendFailure.text();
    expect(backendFailureText).toBe('Could not load runtime quiz image.');
    expect(backendFailureText).not.toContain('Cloudflare R2');
    expect(backendFailureText).not.toContain('secret.png');

    playerMode = 'success';
    const badRequest = await GET(new Request('https://example.test/runtime-assets?roomCode=ABCD12&objectKey=quiz-images/quiz-1/question-1/image.png'));
    expect(badRequest.status).toBe(400);
    expect(await badRequest.text()).toBe('Missing roomCode, objectKey, or viewer.');
    expect(hostCalls).toEqual([{ roomCode: 'ABCD12', objectKey: 'quiz-images/quiz-1/question-1/image.png' }]);
    expect(playerCalls).toEqual([
      { roomCode: 'ABCD12', objectKey: 'quiz-images/quiz-1/question-1/option-1.png' },
      { roomCode: 'ABCD12', objectKey: 'quiz-images/quiz-1/question-1/missing.png' },
      { roomCode: 'ABCD12', objectKey: 'quiz-images/quiz-1/question-1/secret.png' },
    ]);
  });
});