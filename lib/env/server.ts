import 'server-only';

import type { ServerEnv } from '@/types/app';
import { readOptionalEnvString, type EnvSource } from '@/lib/env/shared';

export type ServerSecretKey = 'CLERK_SECRET_KEY' | 'SPACETIME_ADMIN_TOKEN' | 'RUNTIME_BOOTSTRAP_SIGNING_KEY';

export function parseServerEnv(source: EnvSource): ServerEnv {
  return {
    clerkSecretKey: readOptionalEnvString(source, 'CLERK_SECRET_KEY'),
    spacetimeAdminToken: readOptionalEnvString(source, 'SPACETIME_ADMIN_TOKEN'),
    spacetimeDatabase: readOptionalEnvString(source, 'SPACETIME_DATABASE'),
    runtimeBootstrapSigningKey: readOptionalEnvString(source, 'RUNTIME_BOOTSTRAP_SIGNING_KEY'),
  };
}

export function getServerEnv() {
  return parseServerEnv(process.env);
}