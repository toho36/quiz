import 'server-only';
import { ConfigurationError, type EnvSource } from '@/lib/env/shared';
import { parseServerEnv, type ServerSecretKey } from '@/lib/env/server';

const REQUIRED_KEYS = {
  canCreateRooms: ['CLERK_SECRET_KEY', 'SPACETIME_ADMIN_TOKEN'],
  canIssueHostClaims: ['RUNTIME_BOOTSTRAP_SIGNING_KEY'],
  'create-room': ['CLERK_SECRET_KEY', 'SPACETIME_ADMIN_TOKEN'],
  'issue-host-claims': ['RUNTIME_BOOTSTRAP_SIGNING_KEY'],
} as const;

type RuntimeBootstrapScope = 'create-room' | 'issue-host-claims';

export function getRuntimeBootstrapReadiness(source: EnvSource = process.env) {
  const env = parseServerEnv(source);
  const missing = getMissingServerSecretKeys(env, [
    'CLERK_SECRET_KEY',
    'SPACETIME_ADMIN_TOKEN',
    'RUNTIME_BOOTSTRAP_SIGNING_KEY',
  ]);

  return {
    canCreateRooms: REQUIRED_KEYS.canCreateRooms.every((key) => !missing.includes(key)),
    canIssueHostClaims: REQUIRED_KEYS.canIssueHostClaims.every((key) => !missing.includes(key)),
    missing,
  };
}

export function requireRuntimeBootstrapEnv(scope: RuntimeBootstrapScope, source: EnvSource = process.env) {
  const env = parseServerEnv(source);
  const missing = getMissingServerSecretKeys(env, REQUIRED_KEYS[scope]);

  if (missing.length > 0) {
    throw new ConfigurationError(`Runtime bootstrap cannot ${scope} without: ${missing.join(', ')}`);
  }

  if (scope === 'create-room') {
    return {
      clerkSecretKey: env.clerkSecretKey!,
      spacetimeAdminToken: env.spacetimeAdminToken!,
    };
  }

  return {
    runtimeBootstrapSigningKey: env.runtimeBootstrapSigningKey!,
  };
}

function getMissingServerSecretKeys(
  env: ReturnType<typeof parseServerEnv>,
  requiredKeys: readonly ServerSecretKey[],
) {
  const missing: ServerSecretKey[] = [];

  for (const key of requiredKeys) {
    if (key === 'CLERK_SECRET_KEY' && !env.clerkSecretKey) {
      missing.push(key);
    }

    if (key === 'SPACETIME_ADMIN_TOKEN' && !env.spacetimeAdminToken) {
      missing.push(key);
    }

    if (key === 'RUNTIME_BOOTSTRAP_SIGNING_KEY' && !env.runtimeBootstrapSigningKey) {
      missing.push(key);
    }
  }

  return missing;
}