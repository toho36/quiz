import type { AppEnvironment } from '@/types/app';

function resolveEnvironment(value: string | undefined): AppEnvironment {
  if (value === 'preview' || value === 'production') {
    return value;
  }

  return 'local';
}

export function getPublicRuntimeConfig() {
  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    environment: resolveEnvironment(process.env.NEXT_PUBLIC_APP_ENV),
    clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? null,
    spacetimeEndpoint: process.env.NEXT_PUBLIC_SPACETIME_ENDPOINT ?? null,
  };
}