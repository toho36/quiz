import { describe, expect, test } from 'bun:test';
import { createCloudflareR2QuizImageStore } from '@/lib/server/quiz-image-store';

const PNG_1X1_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
  0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x04, 0x00, 0x00, 0x00, 0xb5, 0x1c, 0x0c, 0x02, 0x00, 0x00, 0x00,
  0x0b, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0xfc, 0xff, 0x1f, 0x00, 0x03, 0x03, 0x02, 0x00, 0xef, 0xef,
  0x65, 0x5f, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function requestBodyText(init: RequestInit | undefined) {
  if (!init?.body) {
    return '';
  }
  return new Response(init.body).text();
}

describe('cloudflare r2 quiz image store', () => {
  test('signs put/get/list requests for the private quiz bucket', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const responses = [
      new Response(null, { status: 200 }),
      new Response(PNG_1X1_BYTES, { status: 200, headers: { 'content-type': 'image/png' } }),
      new Response(
        `<ListBucketResult><Contents><Size>68</Size></Contents><Contents><Size>32</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>`,
        { status: 200 },
      ),
      new Response(null, { status: 204 }),
    ];
    const store = createCloudflareR2QuizImageStore({
      config: {
        accountId: 'account-123',
        accessKeyId: 'key-123',
        secretAccessKey: 'secret-123',
        bucketName: 'quiz',
      },
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return responses.shift() ?? new Response(null, { status: 500 });
      },
      now: () => new Date('2026-03-08T12:00:00.000Z'),
    });

    await store.putObject({
      objectKey: 'quiz-images/quiz-1/questions/question-1/image.png',
      contentType: 'image/png',
      data: PNG_1X1_BYTES,
    });
    const loaded = await store.getObject({ objectKey: 'quiz-images/quiz-1/questions/question-1/image.png' });
    const total = await store.getStoredBytes();
    await store.deleteObject({ objectKey: 'quiz-images/quiz-1/questions/question-1/image.png' });

    expect(loaded?.data).toEqual(PNG_1X1_BYTES);
    expect(total).toBe(100);
    expect(calls).toHaveLength(4);
    expect(calls[0]?.url).toBe('https://account-123.r2.cloudflarestorage.com/quiz/quiz-images/quiz-1/questions/question-1/image.png');
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(calls[1]?.init?.method).toBe('GET');
    expect(calls[2]?.url).toBe('https://account-123.r2.cloudflarestorage.com/quiz?list-type=2&prefix=quiz-images%2F');
    expect(calls[3]?.init?.method).toBe('DELETE');
    expect(calls[3]?.url).toBe('https://account-123.r2.cloudflarestorage.com/quiz/quiz-images/quiz-1/questions/question-1/image.png');

    for (const call of calls) {
      const headers = new Headers(call.init?.headers);
      expect(headers.get('authorization')).toContain('Credential=key-123/20260308/auto/s3/aws4_request');
      expect(headers.get('authorization')).toContain('SignedHeaders=host;x-amz-content-sha256;x-amz-date');
      expect(headers.get('x-amz-date')).toBe('20260308T120000Z');
    }
  });

  test('recovers a stale quota lock with a conditional overwrite before running the operation', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    let recoveredLockBody = '';
    let runs = 0;
    const store = createCloudflareR2QuizImageStore({
      config: {
        accountId: 'account-123',
        accessKeyId: 'key-123',
        secretAccessKey: 'secret-123',
        bucketName: 'quiz',
      },
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        switch (calls.length) {
          case 1:
            return new Response(null, { status: 412 });
          case 2:
            return new Response(JSON.stringify({ acquired_at: '2026-03-08T11:58:59.000Z', token: 'stale-token' }), {
              status: 200,
              headers: { etag: '"stale-etag"' },
            });
          case 3:
            recoveredLockBody = await requestBodyText(init);
            return new Response(null, { status: 200 });
          case 4:
            return new Response(recoveredLockBody, { status: 200, headers: { etag: '"fresh-etag"' } });
          case 5:
            return new Response(null, { status: 204 });
          default:
            return new Response(null, { status: 500 });
        }
      },
      now: () => new Date('2026-03-08T12:00:00.000Z'),
    });

    await store.runWithQuotaLock(async () => {
      runs += 1;
    });

    expect(runs).toBe(1);
    expect(calls).toHaveLength(5);
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(calls[0]?.url).toBe('https://account-123.r2.cloudflarestorage.com/quiz/quiz-system/locks/quiz-image-quota.lock');
    expect(new Headers(calls[0]?.init?.headers).get('if-none-match')).toBe('*');
    expect(calls[1]?.init?.method).toBe('GET');
    expect(calls[2]?.init?.method).toBe('PUT');
    expect(new Headers(calls[2]?.init?.headers).get('if-match')).toBe('"stale-etag"');
    expect(JSON.parse(recoveredLockBody)).toMatchObject({ acquired_at: '2026-03-08T12:00:00.000Z' });
    expect(typeof JSON.parse(recoveredLockBody).token).toBe('string');
    expect(calls[3]?.init?.method).toBe('GET');
    expect(calls[4]?.init?.method).toBe('DELETE');
  });

  test('does not turn a successful quota-locked operation into a failure when lock release fails', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    let lockBody = '';
    const store = createCloudflareR2QuizImageStore({
      config: {
        accountId: 'account-123',
        accessKeyId: 'key-123',
        secretAccessKey: 'secret-123',
        bucketName: 'quiz',
      },
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        switch (calls.length) {
          case 1:
            lockBody = await requestBodyText(init);
            return new Response(null, { status: 200 });
          case 2:
            return new Response(lockBody, { status: 200, headers: { etag: '"lock-etag"' } });
          case 3:
            return new Response(null, { status: 500 });
          default:
            return new Response(null, { status: 500 });
        }
      },
      now: () => new Date('2026-03-08T12:00:00.000Z'),
    });

    await expect(store.runWithQuotaLock(async () => 'ok')).resolves.toBe('ok');

    expect(calls).toHaveLength(3);
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(calls[1]?.init?.method).toBe('GET');
    expect(calls[2]?.init?.method).toBe('DELETE');
  });

  test('preserves the primary operation error when lock release also fails', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    let lockBody = '';
    const store = createCloudflareR2QuizImageStore({
      config: {
        accountId: 'account-123',
        accessKeyId: 'key-123',
        secretAccessKey: 'secret-123',
        bucketName: 'quiz',
      },
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        switch (calls.length) {
          case 1:
            lockBody = await requestBodyText(init);
            return new Response(null, { status: 200 });
          case 2:
            return new Response(lockBody, { status: 200, headers: { etag: '"lock-etag"' } });
          case 3:
            return new Response(null, { status: 500 });
          default:
            return new Response(null, { status: 500 });
        }
      },
      now: () => new Date('2026-03-08T12:00:00.000Z'),
    });

    await expect(
      store.runWithQuotaLock(async () => {
        throw new Error('quota mutation failed');
      }),
    ).rejects.toThrow('quota mutation failed');

    expect(calls).toHaveLength(3);
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(calls[1]?.init?.method).toBe('GET');
    expect(calls[2]?.init?.method).toBe('DELETE');
  });
});