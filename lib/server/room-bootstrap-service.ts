import type { AuthoringService, AuthenticatedAuthor } from '@/lib/server/authoring-service';
import { AuthorizationError, InvalidOperationError } from '@/lib/server/service-errors';
import {
  CONTRACT_LIMITS,
  createRoomResponseSchema,
  hostClaimTokenClaimsSchema,
  type CreateRoomResponse,
  type HostClaimTokenClaims,
  type RoomPolicy,
} from '@/lib/shared/contracts';

export type RuntimeRoomProvisioner = {
  createRoom(input: { sourceQuizId: string; ownerUserId: string; roomPolicy: RoomPolicy }): Promise<{ room_id: string; room_code: string }>;
};

export type HostClaimSigner = {
  signHostClaim(claims: HostClaimTokenClaims): Promise<string>;
};

type RoomBootstrapServiceDependencies = {
  authoringService: Pick<AuthoringService, 'loadOwnedQuizDocument'>;
  roomProvisioner: RuntimeRoomProvisioner;
  hostClaimSigner: HostClaimSigner;
  clock?: () => Date;
  generateJti?: () => string;
};

type CreateRoomBootstrapInput = {
  actor: AuthenticatedAuthor;
  quizId: string;
};

export function buildRoomPolicyFromQuiz(input: {
  default_scoring_mode: RoomPolicy['scoring_mode'];
  default_question_time_limit_seconds: number;
  shuffle_answers_default: boolean;
}): RoomPolicy {
  return {
    scoring_mode: input.default_scoring_mode,
    question_time_limit_seconds: input.default_question_time_limit_seconds,
    shuffle_answers: input.shuffle_answers_default,
    late_join_allowed: false,
  };
}

export function createRoomBootstrapService({
  authoringService,
  roomProvisioner,
  hostClaimSigner,
  clock = () => new Date(),
  generateJti = () => globalThis.crypto.randomUUID(),
}: RoomBootstrapServiceDependencies) {
  async function createRoom({ actor, quizId }: CreateRoomBootstrapInput): Promise<CreateRoomResponse> {
    const clerkSessionId = actor.clerkSessionId?.trim();

    if (!clerkSessionId) {
      throw new AuthorizationError('A verified Clerk session is required for host bootstrap');
    }

    const document = await authoringService.loadOwnedQuizDocument({ actor, quizId });
    if (document.quiz.status !== 'published') {
      throw new InvalidOperationError('Only published quizzes can bootstrap runtime rooms');
    }

    const roomPolicy = buildRoomPolicyFromQuiz(document.quiz);
    const provisionedRoom = await roomProvisioner.createRoom({
      sourceQuizId: document.quiz.quiz_id,
      ownerUserId: actor.clerkUserId,
      roomPolicy,
    });

    const claims = buildHostClaimClaims({
      actor,
      clerkSessionId,
      roomId: provisionedRoom.room_id,
      clock,
      generateJti,
    });

    const hostClaimToken = await hostClaimSigner.signHostClaim(claims);

    return createRoomResponseSchema.parse({
      room_id: provisionedRoom.room_id,
      room_code: provisionedRoom.room_code,
      source_quiz_id: document.quiz.quiz_id,
      room_policy: roomPolicy,
      host_claim_token: hostClaimToken,
      host_claim_expires_at: new Date(claims.exp * 1000).toISOString(),
    });
  }

  return {
    createRoom,
  };
}

function buildHostClaimClaims({
  actor,
  clerkSessionId,
  roomId,
  clock,
  generateJti,
}: {
  actor: AuthenticatedAuthor;
  clerkSessionId: string;
  roomId: string;
  clock: () => Date;
  generateJti: () => string;
}) {
  const issuedAt = Math.floor(clock().getTime() / 1000);

  return hostClaimTokenClaimsSchema.parse({
    purpose: 'host_claim',
    room_id: roomId,
    clerk_user_id: actor.clerkUserId,
    clerk_session_id: clerkSessionId,
    jti: generateJti(),
    iat: issuedAt,
    exp: issuedAt + CONTRACT_LIMITS.hostClaimTtlSeconds,
    v: 1,
  });
}