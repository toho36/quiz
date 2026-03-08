import { readOptionalEnvString, type EnvSource } from '@/lib/env/shared';

const CLERK_PUBLISHABLE_KEY = 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY';
const CLERK_SECRET_KEY = 'CLERK_SECRET_KEY';

export function getClerkEnvStatus(source: EnvSource = process.env) {
  const publishableKey = readOptionalEnvString(source, CLERK_PUBLISHABLE_KEY);
  const secretKey = readOptionalEnvString(source, CLERK_SECRET_KEY);
  const missingKeys: string[] = [];

  if (!publishableKey) {
    missingKeys.push(CLERK_PUBLISHABLE_KEY);
  }

  if (!secretKey) {
    missingKeys.push(CLERK_SECRET_KEY);
  }

  return {
    publishableKey,
    missingKeys,
    isConfigured: Boolean(publishableKey && secretKey),
  };
}