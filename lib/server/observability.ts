import { AuthorizationError, InvalidOperationError, NotFoundError } from '@/lib/server/service-errors';

export type StructuredLogMetadataValue = string | number | boolean | null | string[] | number[] | boolean[];
export type StructuredLogMetadata = Record<string, StructuredLogMetadataValue>;

type StructuredLogLevel = 'info' | 'warn' | 'error';

type StructuredLogInput = {
  event: string;
  metadata: StructuredLogMetadata;
  level?: StructuredLogLevel;
  error?: unknown;
  extra?: Record<string, unknown>;
  redactions?: string[];
};

const REDACTED = '[redacted]';

export function sanitizeForLog(value: string, redactions: string[] = []) {
  return [
    process.env.CLERK_SECRET_KEY,
    process.env.SPACETIME_ADMIN_TOKEN,
    process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY,
    ...redactions,
  ]
    .filter((secret): secret is string => Boolean(secret))
    .reduce((current, secret) => current.split(secret).join(REDACTED), value);
}

export function isExpectedStructuredLogError(error: unknown) {
  return error instanceof AuthorizationError || error instanceof InvalidOperationError || error instanceof NotFoundError;
}

export function writeStructuredLog({
  event,
  metadata,
  level = 'info',
  error,
  extra,
  redactions = [],
}: StructuredLogInput) {
  const payload: Record<string, unknown> = {
    event,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'unknown',
    deploymentId: getDeploymentIdentifier(),
    metadata: sanitizeMetadata(metadata, redactions),
    ...extra,
  };

  if (error !== undefined) {
    payload.errorName = error instanceof Error ? error.name : 'UnknownError';
    payload.errorMessage = sanitizeForLog(error instanceof Error ? error.message : String(error), redactions);
  }

  const message = JSON.stringify(payload);
  switch (level) {
    case 'warn':
      console.warn(message);
      return;
    case 'error':
      console.error(message);
      return;
    default:
      console.info(message);
  }
}

function sanitizeMetadata(metadata: StructuredLogMetadata, redactions: string[]) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? value.map((entry) => (typeof entry === 'string' ? sanitizeForLog(entry, redactions) : entry))
        : typeof value === 'string'
          ? sanitizeForLog(value, redactions)
          : value,
    ]),
  );
}

function getDeploymentIdentifier() {
  return (
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    null
  );
}