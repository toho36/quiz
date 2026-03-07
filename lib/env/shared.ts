import type { AppEnvironment } from '@/types/app';

export type EnvSource = Record<string, string | undefined>;

const APP_ENVIRONMENTS: AppEnvironment[] = ['local', 'preview', 'production'];

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function readOptionalEnvString(source: EnvSource, key: string) {
  const value = source[key]?.trim();
  return value ? value : null;
}

export function readRequiredEnvString(source: EnvSource, key: string) {
  const value = readOptionalEnvString(source, key);

  if (!value) {
    throw new ConfigurationError(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function parseAppEnvironment(source: EnvSource, key: string): AppEnvironment {
  const value = readRequiredEnvString(source, key);

  if (APP_ENVIRONMENTS.includes(value as AppEnvironment)) {
    return value as AppEnvironment;
  }

  throw new ConfigurationError(
    `Invalid ${key}: expected one of ${APP_ENVIRONMENTS.join(', ')}, received "${value}"`,
  );
}

export function parseRequiredAbsoluteUrl(source: EnvSource, key: string) {
  const value = readRequiredEnvString(source, key);
  validateAbsoluteUrl(value, key);
  return value;
}

export function parseOptionalAbsoluteUrl(source: EnvSource, key: string) {
  const value = readOptionalEnvString(source, key);

  if (!value) {
    return null;
  }

  validateAbsoluteUrl(value, key);
  return value;
}

function validateAbsoluteUrl(value: string, key: string) {
  try {
    new URL(value);
  } catch {
    throw new ConfigurationError(`Invalid ${key}: expected an absolute URL, received "${value}"`);
  }
}