import type { PublicRuntimeConfig } from '@/types/app';
import {
  parseAppEnvironment,
  parseOptionalAbsoluteUrl,
  parseRequiredAbsoluteUrl,
  readOptionalEnvString,
  type EnvSource,
} from '@/lib/env/shared';

export function parsePublicRuntimeConfig(source: EnvSource): PublicRuntimeConfig {
  return {
    appUrl: parseRequiredAbsoluteUrl(source, 'NEXT_PUBLIC_APP_URL'),
    environment: parseAppEnvironment(source, 'NEXT_PUBLIC_APP_ENV'),
    clerkPublishableKey: readOptionalEnvString(source, 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'),
    spacetimeEndpoint: parseOptionalAbsoluteUrl(source, 'NEXT_PUBLIC_SPACETIME_ENDPOINT'),
  };
}

export function getPublicRuntimeConfig() {
  return parsePublicRuntimeConfig(process.env);
}