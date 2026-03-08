import type { ServerEnv } from '@/types/app';
import { readOptionalEnvString, type EnvSource } from '@/lib/env/shared';

export type ServerSecretKey = 'CLERK_SECRET_KEY' | 'SPACETIME_ADMIN_TOKEN' | 'RUNTIME_BOOTSTRAP_SIGNING_KEY';

export function parseServerEnv(source: EnvSource): ServerEnv {
  return {
    clerkSecretKey: readOptionalEnvString(source, 'CLERK_SECRET_KEY'),
    cloudflareR2AccessKeyId: readOptionalEnvString(source, 'CLOUDFLARE_R2_ACCESS_KEY_ID'),
    cloudflareR2AccountId: readOptionalEnvString(source, 'CLOUDFLARE_R2_ACCOUNT_ID'),
    cloudflareR2BucketName: readOptionalEnvString(source, 'CLOUDFLARE_R2_BUCKET_NAME') ?? 'quiz',
    cloudflareR2SecretAccessKey: readOptionalEnvString(source, 'CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
    spacetimeAdminToken: readOptionalEnvString(source, 'SPACETIME_ADMIN_TOKEN'),
    spacetimeDatabase: readOptionalEnvString(source, 'SPACETIME_DATABASE'),
    runtimeBootstrapSigningKey: readOptionalEnvString(source, 'RUNTIME_BOOTSTRAP_SIGNING_KEY'),
  };
}

export function getServerEnv() {
  return parseServerEnv(process.env);
}