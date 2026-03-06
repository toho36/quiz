import 'server-only';
import { getServerEnv } from '@/lib/env/server';

const REQUIRED_KEYS = {
  canCreateRooms: ['CLERK_SECRET_KEY', 'SPACETIME_ADMIN_TOKEN'],
  canIssueHostClaims: ['RUNTIME_BOOTSTRAP_SIGNING_KEY'],
} as const;

export function getRuntimeBootstrapReadiness() {
  const env = getServerEnv();
  const missing: string[] = [];

  if (!env.clerkSecretKey) {
    missing.push('CLERK_SECRET_KEY');
  }

  if (!env.spacetimeAdminToken) {
    missing.push('SPACETIME_ADMIN_TOKEN');
  }

  if (!env.runtimeBootstrapSigningKey) {
    missing.push('RUNTIME_BOOTSTRAP_SIGNING_KEY');
  }

  return {
    canCreateRooms: REQUIRED_KEYS.canCreateRooms.every((key) => !missing.includes(key)),
    canIssueHostClaims: REQUIRED_KEYS.canIssueHostClaims.every((key) => !missing.includes(key)),
    missing,
  };
}