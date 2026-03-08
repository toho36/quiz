import { createHash, randomBytes } from 'node:crypto';
import { getPublicRuntimeConfig } from '@/lib/env/public';
import type { AuthenticatedAuthor } from '@/lib/server/authoring-service';
import { createAuthoringService } from '@/lib/server/authoring-service';
import { createDemoSeedQuizDocuments } from '@/lib/server/demo-seed';
import { createRoomBootstrapService } from '@/lib/server/room-bootstrap-service';
import { createRuntimeGameplayService, type AcceptedAnswerSubmission } from '@/lib/server/runtime-gameplay-service';
import { AuthorizationError, InvalidOperationError, NotFoundError } from '@/lib/server/service-errors';
import {
  answerSubmissionCommandSchema,
  authoringQuizDocumentSchema,
  hostRoomStateSchema,
  playerJoinCommandSchema,
  playerReconnectCommandSchema,
  playerRoomStateSchema,
  runtimeQuestionOptionSnapshotSchema,
  runtimeQuestionSnapshotSchema,
  runtimeRoomSchema,
  type AuthoringQuizDocument,
  type CreateRoomResponse,
  type HostAllowedAction,
  type HostRoomState,
  type PlayerLatestOutcome,
  type PlayerRoomState,
  type RuntimeQuestionOptionSnapshot,
  type RuntimeQuestionSnapshot,
  type RuntimeQuestionState,
  type RuntimeRoom,
  type RuntimeRoomPlayer,
} from '@/lib/shared/contracts';

export const demoAuthorActor: AuthenticatedAuthor = {
  clerkUserId: 'user-1',
  clerkSessionId: 'demo-session-1',
};

type DemoClock = () => Date;

const LOBBY_ROOM_TTL_MS = 24 * 60 * 60 * 1000;

type DemoQuizSummary = {
  quiz_id: string;
  title: string;
  status: AuthoringQuizDocument['quiz']['status'];
  question_count: number;
  updated_at: string;
};

type GuestBinding = {
  roomId: string;
  roomCode: string;
  roomPlayerId: string;
  resumeExpiresAt: string;
  resumeVersion: number;
};

type PlayerSessionBinding = GuestBinding & {
  resumeToken: string;
};

type RoomSession = {
  bootstrap: CreateRoomResponse | null;
  room: RuntimeRoom;
  questionSnapshots: RuntimeQuestionSnapshot[];
  optionSnapshots: RuntimeQuestionOptionSnapshot[];
  questionState: RuntimeQuestionState | null;
  players: RuntimeRoomPlayer[];
  acceptedSubmissions: AcceptedAnswerSubmission[];
  latestOutcomes: Record<string, PlayerLatestOutcome | null>;
  leaderboard: HostRoomState['leaderboard'];
};

type DemoState = {
  quizzes: Map<string, AuthoringQuizDocument>;
  roomsByCode: Map<string, RoomSession>;
  guestBindings: Map<string, Map<string, GuestBinding>>;
  nextRoomNumber: number;
  nextPlayerNumber: number;
  nextClaimNumber: number;
};

type DemoAppServiceDependencies = {
  clock?: DemoClock;
  logger?: DemoLifecycleLogger;
};

type DemoLifecycleLogPayload = {
  event: 'demo.create_room' | 'demo.player_join' | 'demo.player_reconnect' | 'demo.room_lifecycle';
  environment: ReturnType<typeof getPublicRuntimeConfig>['environment'];
  deployment_id: string | null;
  result: 'success' | 'error';
  room_id?: string;
  room_code?: string;
  source_quiz_id?: string;
  clerk_user_id?: string;
  room_player_id?: string;
  action?: HostAllowedAction;
  lifecycle_state?: RuntimeRoom['lifecycle_state'];
  previous_lifecycle_state?: RuntimeRoom['lifecycle_state'];
  question_phase?: RuntimeQuestionState['phase'] | null;
  previous_question_phase?: RuntimeQuestionState['phase'] | null;
  resume_version?: number;
  error_name?: string;
  error_message?: string;
};

type DemoLifecycleLogger = {
  info(payload: DemoLifecycleLogPayload): void;
  error(payload: DemoLifecycleLogPayload): void;
};

const consoleDemoLifecycleLogger: DemoLifecycleLogger = {
  info(payload) {
    console.info(payload);
  },
  error(payload) {
    console.error(payload);
  },
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function addMs(value: string, ms: number) {
  return new Date(Date.parse(value) + ms).toISOString();
}

function now(clock: DemoClock) {
  return clock().toISOString();
}

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

function generateResumeToken() {
  return randomBytes(32).toString('base64url');
}

function hashResumeToken(value: string) {
  return createHash('sha256').update(value).digest('base64url');
}

function createInitialState(): DemoState {
  return {
    quizzes: new Map(createDemoSeedQuizDocuments().map((document) => [document.quiz.quiz_id, clone(document)])),
    roomsByCode: new Map(),
    guestBindings: new Map(),
    nextRoomNumber: 1,
    nextPlayerNumber: 1,
    nextClaimNumber: 1,
  };
}

function buildSessionLogContext(session: RoomSession | null | undefined) {
  if (!session) {
    return {};
  }

  return {
    room_id: session.room.room_id,
    room_code: session.room.room_code,
    lifecycle_state: session.room.lifecycle_state,
    question_phase: session.questionState?.phase ?? null,
  };
}

function serializeErrorForLog(error: unknown) {
  if (error instanceof Error) {
    return {
      error_name: error.name,
      error_message: error.message,
    };
  }

  return {
    error_name: 'UnknownError',
    error_message: 'Unexpected non-error thrown',
  };
}

export function createDemoAppService({ clock = () => new Date(), logger = consoleDemoLifecycleLogger }: DemoAppServiceDependencies = {}) {
  const state = createInitialState();
  const runtimeGameplayService = createRuntimeGameplayService({ clock });
  const environment = getPublicRuntimeConfig().environment;
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? null;

  function logInfo(payload: Omit<DemoLifecycleLogPayload, 'deployment_id' | 'environment'>) {
    logger.info({
      ...payload,
      environment,
      deployment_id: deploymentId,
    });
  }

  function logError(payload: Omit<DemoLifecycleLogPayload, 'deployment_id' | 'environment'>) {
    logger.error({
      ...payload,
      environment,
      deployment_id: deploymentId,
    });
  }

  const authoringService = createAuthoringService({
    clock,
    quizStore: {
      async getQuizDocument(quizId) {
        return clone(state.quizzes.get(quizId) ?? null);
      },
      async saveQuizDocument(document) {
        const parsed = authoringQuizDocumentSchema.parse(document);
        state.quizzes.set(parsed.quiz.quiz_id, clone(parsed));
        return clone(parsed);
      },
    },
  });

  const roomBootstrapService = createRoomBootstrapService({
    authoringService,
    clock,
    generateJti: () => `claim-${state.nextClaimNumber++}`,
    hostClaimSigner: {
      async signHostClaim(claims) {
        return `demo-host-claim:${claims.room_id}:${claims.jti}`;
      },
    },
    roomProvisioner: {
      async createRoom(input) {
        const roomId = `room-${state.nextRoomNumber}`;
        const roomCode = `ROOM${String(state.nextRoomNumber).padStart(2, '0')}`;
        const createdAt = now(clock);
        const room = runtimeRoomSchema.parse({
          room_id: roomId,
          room_code: roomCode,
          source_quiz_id: input.sourceQuizId,
          lifecycle_state: 'lobby',
          current_question_index: null,
          host_binding: { clerk_user_id: input.ownerUserId, host_binding_version: 1 },
          created_at: createdAt,
          started_at: null,
          ended_at: null,
          expires_at: addMs(createdAt, LOBBY_ROOM_TTL_MS),
          room_policy: input.roomPolicy,
        });
        state.roomsByCode.set(roomCode, {
          bootstrap: null,
          room,
          questionSnapshots: [],
          optionSnapshots: [],
          questionState: null,
          players: [],
          acceptedSubmissions: [],
          latestOutcomes: {},
          leaderboard: null,
        });
        state.nextRoomNumber += 1;
        return { room_id: roomId, room_code: roomCode };
      },
    },
  });

  function mustQuizDocument(quizId: string) {
    const quiz = state.quizzes.get(quizId);
    if (!quiz) {
      throw new NotFoundError(`Quiz ${quizId} was not found`);
    }
    return quiz;
  }

  function mustRoomSession(roomCode: string) {
    const session = state.roomsByCode.get(normalizeRoomCode(roomCode));
    if (!session) {
      throw new NotFoundError(`Room ${roomCode} was not found`);
    }
    return session;
  }

  function mustRoomSessionById(roomId: string) {
    const session = [...state.roomsByCode.values()].find((candidate) => candidate.room.room_id === roomId);
    if (!session) {
      throw new NotFoundError(`Room ${roomId} was not found`);
    }
    return session;
  }

  function requireRoomHost(session: RoomSession, actor: AuthenticatedAuthor) {
    if (session.room.host_binding.clerk_user_id !== actor.clerkUserId) {
      throw new AuthorizationError('Only the room owner can manage this host flow');
    }
  }

  function assertRoomStillReadable(session: RoomSession) {
    if (session.room.lifecycle_state === 'expired') {
      throw new InvalidOperationError('Expired rooms are no longer readable');
    }
    if (
      (session.room.lifecycle_state === 'finished' || session.room.lifecycle_state === 'aborted') &&
      Date.parse(now(clock)) > Date.parse(session.room.expires_at)
    ) {
      session.room = runtimeRoomSchema.parse({
        ...session.room,
        lifecycle_state: 'expired',
      });
      throw new InvalidOperationError('Expired rooms are no longer readable');
    }
  }

  function setGuestBinding(guestSessionId: string, binding: GuestBinding) {
    const current = state.guestBindings.get(guestSessionId) ?? new Map<string, GuestBinding>();
    current.set(binding.roomCode, binding);
    state.guestBindings.set(guestSessionId, current);
  }

  function getGuestBinding(guestSessionId: string, roomCode: string) {
    return state.guestBindings.get(guestSessionId)?.get(normalizeRoomCode(roomCode)) ?? null;
  }

  function getQuestionSnapshotsForRoom(session: RoomSession) {
    return [...session.questionSnapshots].sort((left, right) => left.question_index - right.question_index);
  }

  function getCurrentQuestionSnapshot(session: RoomSession) {
    const index = session.room.current_question_index;
    if (index === null) {
      return null;
    }
    return session.questionSnapshots.find((question) => question.question_index === index) ?? null;
  }

  function getCurrentOptionSnapshots(session: RoomSession) {
    const current = getCurrentQuestionSnapshot(session);
    if (!current) {
      return [];
    }
    return session.optionSnapshots
      .filter((option) => option.question_index === current.question_index)
      .sort((left, right) => left.display_position - right.display_position);
  }

  function createGuestBinding(session: RoomSession, player: RuntimeRoomPlayer): GuestBinding {
    return {
      roomId: session.room.room_id,
      roomCode: session.room.room_code,
      roomPlayerId: player.room_player_id,
      resumeExpiresAt: player.resume_expires_at,
      resumeVersion: player.resume_version,
    };
  }

  function createPlayerSessionBinding(binding: GuestBinding, resumeToken: string): PlayerSessionBinding {
    return {
      ...binding,
      resumeToken,
    };
  }

  function buildSharedRoom(session: RoomSession) {
    return {
      room_id: session.room.room_id,
      room_code: session.room.room_code,
      lifecycle_state: session.room.lifecycle_state,
      question_index: session.room.current_question_index,
      question_phase: session.questionState?.phase ?? null,
      question_deadline_at: session.questionState?.deadline_at ?? null,
      room_policy: session.room.room_policy,
    };
  }

  function buildActiveQuestion(session: RoomSession): PlayerRoomState['active_question'] {
    const question = getCurrentQuestionSnapshot(session);
    if (!question || session.room.lifecycle_state !== 'in_progress') {
      return null;
    }
    return {
      question_index: question.question_index,
      prompt: question.prompt,
      question_type: question.question_type,
      display_options: getCurrentOptionSnapshots(session).map((option) => ({
        option_id: option.source_option_id,
        display_position: option.display_position,
        text: option.text,
      })),
    };
  }

  function buildPlayerSubmissionStatus(session: RoomSession, roomPlayerId: string): PlayerRoomState['self']['submission_status'] {
    const currentQuestionIndex = session.room.current_question_index;
    if (currentQuestionIndex === null) {
      return session.latestOutcomes[roomPlayerId] ? 'accepted' : 'not_submitted';
    }
    const hasAcceptedSubmission = session.acceptedSubmissions.some(
      (submission) => submission.room_player_id === roomPlayerId && submission.question_index === currentQuestionIndex,
    );
    if (hasAcceptedSubmission) {
      return session.questionState?.phase === 'question_open' ? 'submitted' : 'accepted';
    }
    return session.questionState?.phase === 'question_open' ? 'not_submitted' : 'no_answer';
  }

  function currentLeaderboard(session: RoomSession) {
    if (session.room.lifecycle_state === 'finished' || session.questionState?.phase === 'leaderboard') {
      return session.leaderboard;
    }
    return null;
  }

  function buildHostAllowedActions(session: RoomSession): HostAllowedAction[] {
    if (session.room.lifecycle_state === 'lobby') {
      return ['start_game', 'abort_game'];
    }
    if (session.room.lifecycle_state !== 'in_progress' || !session.questionState) {
      return [];
    }
    switch (session.questionState.phase) {
      case 'question_open':
        return ['close_question', 'abort_game'];
      case 'question_closed':
        return ['reveal', 'abort_game'];
      case 'reveal':
        return ['show_leaderboard', 'abort_game'];
      case 'leaderboard':
        return hasNextQuestion(session) ? ['next_question', 'abort_game'] : ['finish_game', 'abort_game'];
    }
  }

  function hasNextQuestion(session: RoomSession) {
    if (session.room.current_question_index === null) {
      return false;
    }
    return session.questionSnapshots.some((question) => question.question_index === session.room.current_question_index! + 1);
  }

  return {
    listQuizSummaries(actor: AuthenticatedAuthor): DemoQuizSummary[] {
      return [...state.quizzes.values()]
        .filter((document) => document.quiz.owner_user_id === actor.clerkUserId)
        .sort((left, right) => left.quiz.updated_at.localeCompare(right.quiz.updated_at) * -1)
        .map((document) => ({
          quiz_id: document.quiz.quiz_id,
          title: document.quiz.title,
          status: document.quiz.status,
          question_count: document.questions.length,
          updated_at: document.quiz.updated_at,
        }));
    },

    listActiveRooms(actor: AuthenticatedAuthor) {
      return [...state.roomsByCode.values()]
        .filter((session) => session.room.host_binding.clerk_user_id === actor.clerkUserId)
        .map((session) => ({
          room_code: session.room.room_code,
          source_quiz_id: session.room.source_quiz_id,
          lifecycle_state: session.room.lifecycle_state,
          joined_player_count: session.players.length,
        }));
    },

    async loadQuizDocument({ actor, quizId }: { actor: AuthenticatedAuthor; quizId: string }) {
      return authoringService.loadOwnedQuizDocument({ actor, quizId });
    },

    async saveQuizDetails(input: { actor: AuthenticatedAuthor; quizId: string; title: string; description: string }) {
      const current = await authoringService.loadOwnedQuizDocument({ actor: input.actor, quizId: input.quizId });
      return authoringService.saveQuizDocument({
        actor: input.actor,
        document: {
          ...current,
          quiz: {
            ...current.quiz,
            title: input.title.trim(),
            description: input.description.trim(),
          },
        },
      });
    },

    async saveQuizDocument(input: { actor: AuthenticatedAuthor; document: AuthoringQuizDocument }) {
      return authoringService.saveQuizDocument(input);
    },

    async publishQuiz({ actor, quizId }: { actor: AuthenticatedAuthor; quizId: string }) {
      return authoringService.publishQuiz({ actor, quizId });
    },

    async createRoom({ actor, quizId }: { actor: AuthenticatedAuthor; quizId: string }) {
      try {
        const bootstrap = await roomBootstrapService.createRoom({ actor, quizId });
        const session = mustRoomSession(bootstrap.room_code);
        session.bootstrap = bootstrap;
        logInfo({
          event: 'demo.create_room',
          result: 'success',
          clerk_user_id: actor.clerkUserId,
          source_quiz_id: bootstrap.source_quiz_id,
          ...buildSessionLogContext(session),
        });
        return bootstrap;
      } catch (error) {
        logError({
          event: 'demo.create_room',
          result: 'error',
          clerk_user_id: actor.clerkUserId,
          source_quiz_id: quizId,
          ...serializeErrorForLog(error),
        });
        throw error;
      }
    },

    findHostRoomDetails({ actor, roomCode }: { actor: AuthenticatedAuthor; roomCode: string }) {
      const session = state.roomsByCode.get(normalizeRoomCode(roomCode));
      if (!session) {
        return null;
      }
      requireRoomHost(session, actor);
      assertRoomStillReadable(session);
      return {
        bootstrap: session.bootstrap,
        state: hostRoomStateSchema.parse({
          shared_room: buildSharedRoom(session),
          active_question: buildActiveQuestion(session),
          joined_player_count: session.players.length,
          connected_player_count: session.players.filter((player) => player.status === 'connected').length,
          submission_progress: {
            submitted_player_count: session.acceptedSubmissions.filter(
              (submission) => submission.question_index === session.room.current_question_index,
            ).length,
            total_player_count: session.players.length,
          },
          allowed_actions: buildHostAllowedActions(session),
          leaderboard: currentLeaderboard(session),
        }),
      };
    },

    getHostRoomState({ actor, roomCode }: { actor: AuthenticatedAuthor; roomCode: string }) {
      const details = this.findHostRoomDetails({ actor, roomCode });
      if (!details) {
        throw new NotFoundError(`Room ${roomCode} was not found`);
      }
      return details.state;
    },

    performHostAction(input: { actor: AuthenticatedAuthor; roomCode: string; action: HostAllowedAction }) {
      let session: RoomSession | null = null;
      let previousLifecycleState: RuntimeRoom['lifecycle_state'] | undefined;
      let previousQuestionPhase: RuntimeQuestionState['phase'] | null | undefined;

      try {
        session = mustRoomSession(input.roomCode);
        requireRoomHost(session, input.actor);
        previousLifecycleState = session.room.lifecycle_state;
        previousQuestionPhase = session.questionState?.phase ?? null;

        switch (input.action) {
          case 'start_game': {
            const quiz = mustQuizDocument(session.room.source_quiz_id);
            const questionSnapshots = buildQuestionSnapshots(session.room.room_id, quiz);
            const optionSnapshots = buildOptionSnapshots(session.room.room_id, quiz);
            const started = runtimeGameplayService.startGame({ room: session.room, questionSnapshots });
            session.room = started.room;
            session.questionSnapshots = questionSnapshots;
            session.optionSnapshots = optionSnapshots;
            session.questionState = started.questionState;
            session.acceptedSubmissions = [];
            session.latestOutcomes = {};
            session.leaderboard = null;
            break;
          }
          case 'close_question':
            if (!session.questionState) {
              throw new InvalidOperationError('No active question is available to close');
            }
            session.questionState = runtimeGameplayService.closeQuestion({ room: session.room, questionState: session.questionState });
            break;
          case 'reveal': {
            const question = getCurrentQuestionSnapshot(session);
            if (!session.questionState || !question) {
              throw new InvalidOperationError('No closed question is available to reveal');
            }
            const finalized = runtimeGameplayService.finalizeQuestion({
              room: session.room,
              questionSnapshot: question,
              optionSnapshots: getCurrentOptionSnapshots(session),
              questionState: session.questionState,
              players: session.players,
              acceptedSubmissions: session.acceptedSubmissions,
            });
            session.players = finalized.updatedPlayers;
            session.leaderboard = finalized.leaderboard;
            session.latestOutcomes = Object.fromEntries(
              finalized.submissionRecords.map((record) => [
                record.room_player_id,
                { is_correct: record.is_correct, awarded_points: record.awarded_points },
              ]),
            );
            session.questionState = runtimeGameplayService.revealQuestion({ room: session.room, questionState: session.questionState });
            break;
          }
          case 'show_leaderboard':
            if (!session.questionState) {
              throw new InvalidOperationError('No revealed question is available for leaderboard display');
            }
            session.questionState = runtimeGameplayService.showLeaderboard({ room: session.room, questionState: session.questionState });
            break;
          case 'next_question':
          case 'finish_game': {
            if (!session.questionState) {
              throw new InvalidOperationError('No leaderboard state is active');
            }
            const advanced = runtimeGameplayService.advanceAfterLeaderboard({
              room: session.room,
              questionState: session.questionState,
              questionSnapshots: getQuestionSnapshotsForRoom(session),
            });
            if (input.action === 'finish_game' && advanced.questionState) {
              throw new InvalidOperationError('More questions remain before the game can finish');
            }
            session.room = advanced.room;
            session.questionState = advanced.questionState;
            session.acceptedSubmissions = [];
            if (advanced.questionState) {
              session.latestOutcomes = {};
              session.leaderboard = null;
            }
            break;
          }
          case 'abort_game': {
            session.room = runtimeGameplayService.abortGame({ room: session.room });
            session.questionState = null;
            session.acceptedSubmissions = [];
            session.leaderboard = null;
            break;
          }
        }

        logInfo({
          event: 'demo.room_lifecycle',
          result: 'success',
          action: input.action,
          clerk_user_id: input.actor.clerkUserId,
          previous_lifecycle_state: previousLifecycleState,
          previous_question_phase: previousQuestionPhase,
          ...buildSessionLogContext(session),
        });
        return this.getHostRoomState({ actor: input.actor, roomCode: input.roomCode });
      } catch (error) {
        logError({
          event: 'demo.room_lifecycle',
          result: 'error',
          action: input.action,
          clerk_user_id: input.actor.clerkUserId,
          room_code: normalizeRoomCode(input.roomCode),
          previous_lifecycle_state: previousLifecycleState,
          previous_question_phase: previousQuestionPhase,
          ...buildSessionLogContext(session),
          ...serializeErrorForLog(error),
        });
        throw error;
      }
    },

    joinRoom(input: { guestSessionId: string; roomCode: string; displayName: string }): PlayerSessionBinding {
      let session: RoomSession | null = null;

      try {
        const command = playerJoinCommandSchema.parse({ room_code: input.roomCode, display_name: input.displayName });
        const normalizedRoomCode = normalizeRoomCode(command.room_code);
        const existingBinding = getGuestBinding(input.guestSessionId, normalizedRoomCode);
        if (existingBinding) {
          throw new InvalidOperationError('Room already joined in this guest session');
        }
        session = mustRoomSession(normalizedRoomCode);
        const roomPlayerId = `player-${state.nextPlayerNumber}`;
        const resumeToken = generateResumeToken();
        const joinedPlayer = runtimeGameplayService.joinPlayer({
          room: session.room,
          players: session.players,
          roomPlayerId,
          displayName: command.display_name,
          resumeTokenHash: hashResumeToken(resumeToken),
        });
        session.players = [...session.players, joinedPlayer];
        state.nextPlayerNumber += 1;
        const binding = createGuestBinding(session, joinedPlayer);
        setGuestBinding(input.guestSessionId, binding);
        logInfo({
          event: 'demo.player_join',
          result: 'success',
          room_player_id: binding.roomPlayerId,
          resume_version: binding.resumeVersion,
          ...buildSessionLogContext(session),
        });
        return createPlayerSessionBinding(binding, resumeToken);
      } catch (error) {
        logError({
          event: 'demo.player_join',
          result: 'error',
          room_code: normalizeRoomCode(input.roomCode),
          ...buildSessionLogContext(session),
          ...serializeErrorForLog(error),
        });
        throw error;
      }
    },

    reconnectPlayer(input: { guestSessionId: string; roomId: string; roomPlayerId: string; resumeToken: string }): PlayerSessionBinding {
      let session: RoomSession | null = null;
      let existingPlayer: RuntimeRoomPlayer | null = null;

      try {
        const command = playerReconnectCommandSchema.parse({
          room_id: input.roomId,
          room_player_id: input.roomPlayerId,
          resume_token: input.resumeToken,
        });
        session = mustRoomSessionById(command.room_id);
        assertRoomStillReadable(session);
        const playerIndex = session.players.findIndex((entry) => entry.room_player_id === command.room_player_id);
        if (playerIndex === -1) {
          throw new NotFoundError(`Player ${command.room_player_id} was not found in room ${command.room_id}`);
        }

        existingPlayer = session.players[playerIndex];
        const nextResumeToken = generateResumeToken();
        const updatedPlayer = runtimeGameplayService.reconnectPlayer({
          room: session.room,
          player: existingPlayer,
          command,
          presentedResumeTokenHash: hashResumeToken(command.resume_token),
          nextResumeTokenHash: hashResumeToken(nextResumeToken),
        });

        session.players = session.players.map((player, index) => (index === playerIndex ? updatedPlayer : player));
        const binding = createGuestBinding(session, updatedPlayer);
        setGuestBinding(input.guestSessionId, binding);
        logInfo({
          event: 'demo.player_reconnect',
          result: 'success',
          room_player_id: binding.roomPlayerId,
          resume_version: binding.resumeVersion,
          ...buildSessionLogContext(session),
        });
        return createPlayerSessionBinding(binding, nextResumeToken);
      } catch (error) {
        logError({
          event: 'demo.player_reconnect',
          result: 'error',
          room_id: input.roomId,
          room_player_id: input.roomPlayerId,
          resume_version: existingPlayer?.resume_version,
          ...buildSessionLogContext(session),
          ...serializeErrorForLog(error),
        });
        throw error;
      }
    },

    findPlayerRoomState(input: { guestSessionId: string; roomCode: string }) {
      const binding = getGuestBinding(input.guestSessionId, input.roomCode);
      if (!binding) {
        return null;
      }
      const session = mustRoomSession(binding.roomCode);
      assertRoomStillReadable(session);
      const player = session.players.find((entry) => entry.room_player_id === binding.roomPlayerId);
      if (!player) {
        return null;
      }
      if (binding.resumeVersion !== player.resume_version) {
        return null;
      }
      return playerRoomStateSchema.parse({
        shared_room: buildSharedRoom(session),
        active_question: buildActiveQuestion(session),
        self: {
          room_player_id: player.room_player_id,
          display_name: player.display_name,
          score_total: player.score_total,
          correct_count: player.correct_count,
          submission_status: buildPlayerSubmissionStatus(session, player.room_player_id),
          latest_outcome: session.latestOutcomes[player.room_player_id] ?? null,
        },
        leaderboard: currentLeaderboard(session),
      });
    },

    getPlayerRoomState(input: { guestSessionId: string; roomCode: string }) {
      const state = this.findPlayerRoomState(input);
      if (!state) {
        throw new NotFoundError(`No player session is bound to room ${input.roomCode}`);
      }
      return state;
    },

    submitAnswer(input: { guestSessionId: string; roomCode: string; selectedOptionIds: string[] }) {
      const binding = getGuestBinding(input.guestSessionId, input.roomCode);
      if (!binding) {
        throw new AuthorizationError('Join the room before submitting answers');
      }
      const session = mustRoomSession(binding.roomCode);
      assertRoomStillReadable(session);
      const player = session.players.find((entry) => entry.room_player_id === binding.roomPlayerId);
      if (!player) {
        throw new AuthorizationError('Join the room before submitting answers');
      }
      if (binding.resumeVersion !== player.resume_version) {
        throw new AuthorizationError('Player session has been replaced by a newer reconnect');
      }
      const question = getCurrentQuestionSnapshot(session);
      if (!session.questionState || !question) {
        throw new InvalidOperationError('No active question is available');
      }
      const accepted = runtimeGameplayService.acceptSubmission({
        room: session.room,
        questionState: session.questionState,
        questionSnapshot: question,
        optionSnapshots: getCurrentOptionSnapshots(session),
        roomPlayerId: player.room_player_id,
        command: answerSubmissionCommandSchema.parse({
          room_id: session.room.room_id,
          question_index: question.question_index,
          selected_option_ids: input.selectedOptionIds,
        }),
        existingAcceptedSubmissions: session.acceptedSubmissions,
      });
      session.acceptedSubmissions = [...session.acceptedSubmissions, accepted.acceptedSubmission];
      return accepted.acceptedSubmission;
    },
  };
}

function buildQuestionSnapshots(roomId: string, document: AuthoringQuizDocument) {
  return document.questions
    .slice()
    .sort((left, right) => left.question.position - right.question.position)
    .map((entry, index) =>
      runtimeQuestionSnapshotSchema.parse({
        room_id: roomId,
        question_index: index,
        source_question_id: entry.question.question_id,
        prompt: entry.question.prompt,
        question_type: entry.question.question_type,
        evaluation_policy: entry.question.evaluation_policy,
        base_points: entry.question.base_points,
        effective_time_limit_seconds: entry.question.time_limit_seconds,
        shuffle_answers: entry.question.shuffle_answers,
      }),
    );
}

function buildOptionSnapshots(roomId: string, document: AuthoringQuizDocument) {
  return document.questions
    .slice()
    .sort((left, right) => left.question.position - right.question.position)
    .flatMap((entry, questionIndex) => {
      const orderedOptions = entry.options.slice().sort((left, right) => left.position - right.position);
      const displayPositions = entry.question.shuffle_answers
        ? orderedOptions.map((_, index, all) => all.length - index)
        : orderedOptions.map((_, index) => index + 1);
      return orderedOptions.map((option, optionIndex) =>
        runtimeQuestionOptionSnapshotSchema.parse({
          room_id: roomId,
          question_index: questionIndex,
          source_option_id: option.option_id,
          author_position: option.position,
          display_position: displayPositions[optionIndex],
          text: option.text,
          is_correct: option.is_correct,
        }),
      );
    });
}

const globalDemoAppKey = '__quizDemoAppService';

export function getDemoAppService() {
  const globalScope = globalThis as typeof globalThis & { [globalDemoAppKey]?: ReturnType<typeof createDemoAppService> };
  if (!globalScope[globalDemoAppKey]) {
    globalScope[globalDemoAppKey] = createDemoAppService();
  }
  return globalScope[globalDemoAppKey]!;
}