import 'server-only';

import type { Route } from 'next';
import { auth } from '@clerk/nextjs/server';
import { getClerkEnvStatus } from '@/lib/env/clerk';
import { ConfigurationError } from '@/lib/env/shared';
import type { AuthenticatedAuthor } from '@/lib/server/authoring-service';
import { AuthorizationError } from '@/lib/server/service-errors';

export const CLERK_INSTALL_COMMAND = 'bun add @clerk/nextjs';
export const CLERK_SIGN_IN_PATH = '/sign-in' as Route;

type ClerkAuthState = {
  userId: string | null;
  sessionId: string | null;
};

export type ProtectedAuthorState =
  | { status: 'authenticated'; actor: AuthenticatedAuthor }
  | { status: 'unauthenticated' }
  | { status: 'setup-required'; message: string; installCommand: string; missingEnvKeys: string[] };

export function createProtectedAuthorResolver({ loadClerkAuth }: { loadClerkAuth: () => Promise<ClerkAuthState> }) {
  async function getState(): Promise<ProtectedAuthorState> {
    try {
      const actor = toAuthenticatedAuthor(await loadClerkAuth());
      return actor ? { status: 'authenticated', actor } : { status: 'unauthenticated' };
    } catch (error) {
      if (error instanceof ConfigurationError) {
        return {
          status: 'setup-required',
          message: error.message,
          installCommand: CLERK_INSTALL_COMMAND,
          missingEnvKeys: getClerkEnvStatus().missingKeys,
        };
      }

      throw error;
    }
  }

  async function getActor() {
    const state = await getState();
    return state.status === 'authenticated' ? state.actor : null;
  }

  async function requireActor() {
    const state = await getState();

    if (state.status === 'authenticated') {
      return state.actor;
    }

    if (state.status === 'setup-required') {
      throw new AuthorizationError(state.message);
    }

    throw new AuthorizationError('Sign in with Clerk to continue');
  }

  return {
    getState,
    getActor,
    requireActor,
  };
}

function toAuthenticatedAuthor(auth: ClerkAuthState): AuthenticatedAuthor | null {
  const clerkUserId = auth.userId?.trim();
  const clerkSessionId = auth.sessionId?.trim();

  if (!clerkUserId || !clerkSessionId) {
    return null;
  }

  return { clerkUserId, clerkSessionId };
}

async function loadClerkAuthFromServer(): Promise<ClerkAuthState> {
  const { missingKeys: missingEnvKeys, isConfigured } = getClerkEnvStatus();

  if (!isConfigured) {
    throw new ConfigurationError(
      `Protected author actions require Clerk-backed server auth. Configure ${missingEnvKeys.join(', ')} before enabling author or host flows.`,
    );
  }

  const { userId, sessionId } = await auth();
  return { userId, sessionId };
}

const protectedAuthorResolver = createProtectedAuthorResolver({ loadClerkAuth: loadClerkAuthFromServer });

export function getProtectedAuthorState() {
  return protectedAuthorResolver.getState();
}

export function getProtectedAuthorActor() {
  return protectedAuthorResolver.getActor();
}

export function requireProtectedAuthorActor() {
  return protectedAuthorResolver.requireActor();
}