import { createHash, createHmac, randomUUID, type BinaryLike } from 'node:crypto';
import type { QuizImageContentType } from '@/lib/shared/contracts';
import { InvalidOperationError } from '@/lib/server/service-errors';

export type StoredQuizImageBytes = {
  bytes: number;
  content_type: QuizImageContentType;
  data: Uint8Array;
};

export type QuizImageStore = {
  getObject(input: { objectKey: string }): Promise<StoredQuizImageBytes | null>;
  getStoredBytes(): Promise<number>;
  putObject(input: { objectKey: string; contentType: QuizImageContentType; data: Uint8Array }): Promise<void>;
  deleteObject(input: { objectKey: string }): Promise<void>;
  runWithQuotaLock<T>(operation: () => Promise<T>): Promise<T>;
};

const QUIZ_IMAGE_OBJECT_PREFIX = 'quiz-images/';
const QUIZ_IMAGE_QUOTA_LOCK_OBJECT_KEY = 'quiz-system/locks/quiz-image-quota.lock';
const QUIZ_IMAGE_QUOTA_LOCK_RETRY_MS = 50;
const QUIZ_IMAGE_QUOTA_LOCK_MAX_ATTEMPTS = 200;
const QUIZ_IMAGE_QUOTA_LOCK_STALE_MS = 60_000;

type QuizImageQuotaLockPayload = {
  acquired_at: string;
  token: string;
};

type CloudflareR2QuizImageStoreDependencies = {
  config: {
    accountId: string | null;
    accessKeyId: string | null;
    secretAccessKey: string | null;
    bucketName: string;
  };
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

export function createInMemoryQuizImageStore(): QuizImageStore {
  const objects = new Map<string, StoredQuizImageBytes>();
  let quotaLock = Promise.resolve();

  async function runWithQuotaLock<T>(operation: () => Promise<T>) {
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
  }

  return {
    async getObject({ objectKey }) {
      const current = objects.get(objectKey);
      return current ? { ...current, data: new Uint8Array(current.data) } : null;
    },
    async getStoredBytes() {
      return [...objects.values()].reduce((total, entry) => total + entry.bytes, 0);
    },
    async putObject({ objectKey, contentType, data }) {
      objects.set(objectKey, {
        bytes: data.byteLength,
        content_type: contentType,
        data: new Uint8Array(data),
      });
    },
    async deleteObject({ objectKey }) {
      objects.delete(objectKey);
    },
    runWithQuotaLock,
  };
}

export function createCloudflareR2QuizImageStore({
  config,
  fetchImpl = fetch,
  now = () => new Date(),
}: CloudflareR2QuizImageStoreDependencies): QuizImageStore {
  const service = 's3';
  const region = 'auto';

  function requireConfig() {
    const missing = [
      ['CLOUDFLARE_R2_ACCOUNT_ID', config.accountId],
      ['CLOUDFLARE_R2_ACCESS_KEY_ID', config.accessKeyId],
      ['CLOUDFLARE_R2_SECRET_ACCESS_KEY', config.secretAccessKey],
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);
    if (missing.length > 0) {
      throw new InvalidOperationError(`Cloudflare R2 quiz image storage is not configured. Missing: ${missing.join(', ')}.`);
    }
    return {
      accountId: config.accountId!,
      accessKeyId: config.accessKeyId!,
      bucketName: config.bucketName,
      secretAccessKey: config.secretAccessKey!,
    };
  }

  async function signedFetch(input: {
    method: 'DELETE' | 'GET' | 'PUT';
    objectKey?: string;
    query?: Array<[string, string]>;
    contentType?: string;
    body?: Uint8Array;
    headers?: Array<[string, string]>;
  }) {
    const resolved = requireConfig();
    const timestamp = now();
    const amzDate = formatAmzDate(timestamp);
    const dateStamp = amzDate.slice(0, 8);
    const pathname = buildPathname(resolved.bucketName, input.objectKey);
    const query = buildCanonicalQuery(input.query ?? []);
    const payloadHash = sha256Hex(input.body ?? new Uint8Array());
    const host = `${resolved.accountId}.r2.cloudflarestorage.com`;
    const headers = new Headers({
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    });
    if (input.contentType) {
      headers.set('content-type', input.contentType);
    }
    if (input.body) {
      headers.set('content-length', String(input.body.byteLength));
    }
    for (const [name, value] of input.headers ?? []) {
      headers.set(name, value);
    }

    const canonicalHeaders = [
      ['host', host] as const,
      ['x-amz-content-sha256', payloadHash] as const,
      ['x-amz-date', amzDate] as const,
    ]
      .sort(([left], [right]) => left.localeCompare(right));
    const signedHeaders = canonicalHeaders.map(([name]) => name).join(';');
    const canonicalRequest = [
      input.method,
      pathname,
      query,
      canonicalHeaders.map(([name, value]) => `${name}:${value}\n`).join(''),
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
    const signingKey = getSignatureKey(resolved.secretAccessKey, dateStamp, region, service);
    headers.set(
      'authorization',
      [
        `AWS4-HMAC-SHA256 Credential=${resolved.accessKeyId}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${hmacHex(signingKey, stringToSign)}`,
      ].join(', '),
    );

    const url = `https://${host}${pathname}${query ? `?${query}` : ''}`;
    return fetchImpl(url, {
      method: input.method,
      headers,
      body: input.body ? Uint8Array.from(input.body).buffer : undefined,
    });
  }

  async function getQuotaLockObject() {
    const response = await signedFetch({ method: 'GET', objectKey: QUIZ_IMAGE_QUOTA_LOCK_OBJECT_KEY });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Cloudflare R2 quota lock read failed (${response.status}) for ${QUIZ_IMAGE_QUOTA_LOCK_OBJECT_KEY}.`);
    }
    return {
      etag: response.headers.get('etag'),
      payload: parseQuotaLockPayload(await response.text()),
    };
  }

  async function releaseQuotaLock(lock: QuizImageQuotaLockPayload) {
    try {
      const currentLock = await getQuotaLockObject();
      if (!currentLock || currentLock.payload?.token !== lock.token) {
        return;
      }
      await signedFetch({ method: 'DELETE', objectKey: QUIZ_IMAGE_QUOTA_LOCK_OBJECT_KEY });
    } catch {
      // Best-effort cleanup only. A stale lock can be recovered by a later request.
    }
  }

  return {
    async getObject({ objectKey }) {
      const response = await signedFetch({ method: 'GET', objectKey });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Cloudflare R2 get failed (${response.status}) for ${objectKey}.`);
      }
      const data = new Uint8Array(await response.arrayBuffer());
      return {
        bytes: data.byteLength,
        content_type: (response.headers.get('content-type') ?? 'image/png') as QuizImageContentType,
        data,
      };
    },
    async getStoredBytes() {
      let total = 0;
      let continuationToken: string | null = null;
      do {
        const query: Array<[string, string]> = [['list-type', '2']];
        query.push(['prefix', QUIZ_IMAGE_OBJECT_PREFIX]);
        if (continuationToken) {
          query.push(['continuation-token', continuationToken]);
        }
        const response = await signedFetch({ method: 'GET', query });
        if (!response.ok) {
          throw new Error(`Cloudflare R2 list failed (${response.status}) for bucket ${resolvedBucketName(config.bucketName)}.`);
        }
        const body = await response.text();
        total += [...body.matchAll(/<Size>(\d+)<\/Size>/g)].reduce((sum, match) => sum + Number(match[1] ?? 0), 0);
        continuationToken = /<IsTruncated>true<\/IsTruncated>/.test(body)
          ? decodeXml(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(body)?.[1] ?? '')
          : null;
      } while (continuationToken);
      return total;
    },
    async putObject({ objectKey, contentType, data }) {
      const response = await signedFetch({ method: 'PUT', objectKey, contentType, body: data });
      if (!response.ok) {
        throw new Error(`Cloudflare R2 put failed (${response.status}) for ${objectKey}.`);
      }
    },
    async deleteObject({ objectKey }) {
      const response = await signedFetch({ method: 'DELETE', objectKey });
      if (!response.ok) {
        throw new Error(`Cloudflare R2 delete failed (${response.status}) for ${objectKey}.`);
      }
    },
    async runWithQuotaLock<T>(operation: () => Promise<T>) {
      const lock = {
        acquired_at: now().toISOString(),
        token: randomUUID(),
      } satisfies QuizImageQuotaLockPayload;
      const lockBody = new TextEncoder().encode(JSON.stringify(lock));
      let acquired = false;

      for (let attempt = 0; attempt < QUIZ_IMAGE_QUOTA_LOCK_MAX_ATTEMPTS; attempt += 1) {
        const response = await signedFetch({
          method: 'PUT',
          objectKey: QUIZ_IMAGE_QUOTA_LOCK_OBJECT_KEY,
          contentType: 'application/json',
          body: lockBody,
          headers: [['if-none-match', '*']],
        });
        if (response.ok) {
          acquired = true;
          break;
        }
        if (response.status !== 409 && response.status !== 412) {
          throw new Error(`Cloudflare R2 quota lock failed (${response.status}) for ${QUIZ_IMAGE_QUOTA_LOCK_OBJECT_KEY}.`);
        }

        const currentLock = await getQuotaLockObject();
        if (currentLock?.etag && isQuotaLockStale(currentLock.payload, now())) {
          const recoverResponse = await signedFetch({
            method: 'PUT',
            objectKey: QUIZ_IMAGE_QUOTA_LOCK_OBJECT_KEY,
            contentType: 'application/json',
            body: lockBody,
            headers: [['if-match', currentLock.etag]],
          });
          if (recoverResponse.ok) {
            acquired = true;
            break;
          }
          if (recoverResponse.status !== 409 && recoverResponse.status !== 412) {
            throw new Error(
              `Cloudflare R2 quota lock recovery failed (${recoverResponse.status}) for ${QUIZ_IMAGE_QUOTA_LOCK_OBJECT_KEY}.`,
            );
          }
        }

        await sleep(QUIZ_IMAGE_QUOTA_LOCK_RETRY_MS);
      }

      if (!acquired) {
        throw new Error('Cloudflare R2 quiz image quota lock timed out.');
      }

      try {
        return await operation();
      } finally {
        await releaseQuotaLock(lock);
      }
    },
  };
}

export function createDefaultQuizImageStore(): QuizImageStore {
  if (process.env.NODE_ENV === 'test') {
    return createInMemoryQuizImageStore();
  }
  return createCloudflareR2QuizImageStore({
    config: {
      accountId: process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? null,
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? null,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? null,
      bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim() || 'quiz',
    },
  });
}

function buildCanonicalQuery(entries: Array<[string, string]>) {
  return entries
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function buildPathname(bucketName: string, objectKey?: string) {
  const bucketPath = `/${encodeRfc3986(bucketName)}`;
  if (!objectKey) {
    return bucketPath;
  }
  return `${bucketPath}/${objectKey.split('/').map(encodeRfc3986).join('/')}`;
}

function decodeXml(value: string) {
  return value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'");
}

function isQuotaLockStale(lock: QuizImageQuotaLockPayload | null, currentTime: Date) {
  if (!lock) {
    return true;
  }
  const acquiredAt = Date.parse(lock.acquired_at);
  if (!Number.isFinite(acquiredAt)) {
    return true;
  }
  return currentTime.getTime() - acquiredAt >= QUIZ_IMAGE_QUOTA_LOCK_STALE_MS;
}

function parseQuotaLockPayload(value: string): QuizImageQuotaLockPayload | null {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (typeof parsed.acquired_at !== 'string' || typeof parsed.token !== 'string') {
      return null;
    }
    return {
      acquired_at: parsed.acquired_at,
      token: parsed.token,
    };
  } catch {
    return null;
  }
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (match) => `%${match.charCodeAt(0).toString(16).toUpperCase()}`);
}

function formatAmzDate(value: Date) {
  return value.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function getSignatureKey(secretAccessKey: string, dateStamp: string, region: string, service: string) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function hmac(key: BinaryLike, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key: BinaryLike, value: string) {
  return createHmac('sha256', key).update(value).digest('hex');
}

function resolvedBucketName(bucketName: string) {
  return bucketName || 'quiz';
}

function sha256Hex(value: BinaryLike) {
  return createHash('sha256').update(value).digest('hex');
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}