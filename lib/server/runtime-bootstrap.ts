import 'server-only';
import { parseServerEnv } from '@/lib/env/server';
import {
  ConfigurationError,
  parseRequiredAbsoluteUrl,
  readOptionalEnvString,
  type EnvSource,
} from '@/lib/env/shared';

export type RuntimeBootstrapEnvKey =
  | 'NEXT_PUBLIC_SPACETIME_ENDPOINT'
  | 'SPACETIME_DATABASE'
  | 'SPACETIME_ADMIN_TOKEN'
  | 'RUNTIME_BOOTSTRAP_SIGNING_KEY';

export type RuntimeBootstrapSpacetimeConfig = {
  endpoint: string;
  databaseName: string;
  adminToken: string;
};

const REQUIRED_KEYS = {
  canCreateRooms: ['NEXT_PUBLIC_SPACETIME_ENDPOINT', 'SPACETIME_DATABASE', 'SPACETIME_ADMIN_TOKEN'],
  canIssueHostClaims: ['RUNTIME_BOOTSTRAP_SIGNING_KEY'],
  'create-room': ['NEXT_PUBLIC_SPACETIME_ENDPOINT', 'SPACETIME_DATABASE', 'SPACETIME_ADMIN_TOKEN'],
  'issue-host-claims': ['RUNTIME_BOOTSTRAP_SIGNING_KEY'],
} as const;

type RuntimeBootstrapScope = 'create-room' | 'issue-host-claims';

export function getRuntimeBootstrapReadiness(source: EnvSource = process.env) {
  const missing = getMissingRuntimeBootstrapKeys(source, [
    'NEXT_PUBLIC_SPACETIME_ENDPOINT',
    'SPACETIME_DATABASE',
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
  const missing = getMissingRuntimeBootstrapKeys(source, REQUIRED_KEYS[scope]);

  if (missing.length > 0) {
    throw new ConfigurationError(`Runtime bootstrap cannot ${scope} without: ${missing.join(', ')}`);
  }

  if (scope === 'create-room') {
    return {
      spacetimeEndpoint: parseRequiredAbsoluteUrl(source, 'NEXT_PUBLIC_SPACETIME_ENDPOINT'),
      spacetimeDatabase: env.spacetimeDatabase!,
      spacetimeAdminToken: env.spacetimeAdminToken!,
    };
  }

  return {
    runtimeBootstrapSigningKey: env.runtimeBootstrapSigningKey!,
  };
}

export function parseRuntimeBootstrapSpacetimeConfig(source: EnvSource = process.env): RuntimeBootstrapSpacetimeConfig {
  const env = requireRuntimeBootstrapEnv('create-room', source);

  return {
    endpoint: env.spacetimeEndpoint!,
    databaseName: env.spacetimeDatabase!,
    adminToken: env.spacetimeAdminToken!,
  };
}

function getMissingRuntimeBootstrapKeys(source: EnvSource, requiredKeys: readonly RuntimeBootstrapEnvKey[]) {
  const env = parseServerEnv(source);
  const missing: RuntimeBootstrapEnvKey[] = [];

  for (const key of requiredKeys) {
    if (key === 'NEXT_PUBLIC_SPACETIME_ENDPOINT' && !readOptionalEnvString(source, 'NEXT_PUBLIC_SPACETIME_ENDPOINT')) {
      missing.push(key);
    }

    if (key === 'SPACETIME_DATABASE' && !env.spacetimeDatabase) {
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