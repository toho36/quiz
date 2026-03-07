import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseServerEnv } from '@/lib/env/server';
import { ConfigurationError } from '@/lib/env/shared';
import type { HostClaimSigner } from '@/lib/server/room-bootstrap-service';
import { AuthorizationError } from '@/lib/server/service-errors';
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

export function verifyRuntimeHostClaimToken(
  token: string,
  signingKey = parseServerEnv(process.env).runtimeBootstrapSigningKey,
): HostClaimTokenClaims {
  if (!signingKey) {
    throw new ConfigurationError('Runtime bootstrap cannot verify-host-claims without: RUNTIME_BOOTSTRAP_SIGNING_KEY');
  }

  const [version, payload, signature, ...extra] = token.trim().split('.');
  if (!version || !payload || !signature || extra.length > 0) {
    throw new AuthorizationError('Host claim token is malformed');
  }
  if (version !== HOST_CLAIM_TOKEN_VERSION) {
    throw new AuthorizationError('Host claim token version is not supported');
  }

  const expectedSignature = createHmac('sha256', signingKey).update(payload).digest('base64url');
  if (!signaturesMatch(signature, expectedSignature)) {
    throw new AuthorizationError('Host claim token signature is invalid');
  }

  try {
    return hostClaimTokenClaimsSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
  } catch {
    throw new AuthorizationError('Host claim token payload is invalid');
  }
}

function signaturesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}