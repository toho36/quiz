import 'server-only';

import { createHmac } from 'node:crypto';
import { parseServerEnv } from '@/lib/env/server';
import { ConfigurationError } from '@/lib/env/shared';
import type { HostClaimSigner } from '@/lib/server/room-bootstrap-service';
import { hostClaimTokenClaimsSchema, type HostClaimTokenClaims } from '@/lib/shared/contracts';

const HOST_CLAIM_TOKEN_VERSION = 'v1';

export function createRuntimeHostClaimSigner(
  signingKey = parseServerEnv(process.env).runtimeBootstrapSigningKey,
): HostClaimSigner {
  if (!signingKey) {
    throw new ConfigurationError('Runtime bootstrap cannot issue-host-claims without: RUNTIME_BOOTSTRAP_SIGNING_KEY');
  }

  return {
    async signHostClaim(claims: HostClaimTokenClaims) {
      const payload = Buffer.from(JSON.stringify(hostClaimTokenClaimsSchema.parse(claims))).toString('base64url');
      const signature = createHmac('sha256', signingKey).update(payload).digest('base64url');
      return `${HOST_CLAIM_TOKEN_VERSION}.${payload}.${signature}`;
    },
  };
}