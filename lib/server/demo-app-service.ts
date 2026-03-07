import type { AuthenticatedAuthor } from '@/lib/server/authoring-service';
import { createAuthoringService } from '@/lib/server/authoring-service';
import {
  createSpacetimeAuthoringStore,
  type AuthoringSpacetimeClientFactory,
} from '@/lib/server/authoring-spacetimedb-store';
import {
  createSpacetimeRuntimeBootstrapProvisioner,
  type RuntimeBootstrapProvisioner,
} from '@/lib/server/runtime-spacetimedb-bootstrap';
import { createDemoSeedQuizDocuments } from '@/lib/server/demo-seed';
import { createRoomBootstrapService } from '@/lib/server/room-bootstrap-service';
import { createRuntimeGameplayService, type AcceptedAnswerSubmission } from '@/lib/server/runtime-gameplay-service';
import { AuthorizationError, InvalidOperationError, NotFoundError } from '@/lib/server/service-errors';
import {
  answerSubmissionCommandSchema,
  hostRoomStateSchema,
  playerJoinCommandSchema,
  playerRoomStateSchema,
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

type DemoQuizSummary = {
  quiz_id: string;
  title: string;
  status: AuthoringQuizDocument['quiz']['status'];
  question_count: number;
  updated_at: string;
};

type GuestBinding = {
  roomCode: string;
  roomPlayerId: string;
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
  roomsByCode: Map<string, RoomSession>;
  guestBindings: Map<string, Map<string, GuestBinding>>;
  nextPlayerNumber: number;
  nextClaimNumber: number;
};

type DemoAppServiceDependencies = {
  authoringClientFactory?: AuthoringSpacetimeClientFactory;
  runtimeProvisioner?: RuntimeBootstrapProvisioner;
  clock?: DemoClock;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

function createInitialState(): DemoState {
  return {
    roomsByCode: new Map(),
    guestBindings: new Map(),
    nextPlayerNumber: 1,
    nextClaimNumber: 1,
  };
}

export function createDemoAppService({
  authoringClientFactory,
  runtimeProvisioner = createSpacetimeRuntimeBootstrapProvisioner(),
  clock = () => new Date(),
}: DemoAppServiceDependencies = {}) {
  const state = createInitialState();
  const runtimeGameplayService = createRuntimeGameplayService({ clock });
  let authoringStore: ReturnType<typeof createSpacetimeAuthoringStore> | null = null;

  function getAuthoringStore() {
    if (!authoringStore) {
      authoringStore = createSpacetimeAuthoringStore({
        clientFactory: authoringClientFactory,
        seedDocuments: createDemoSeedQuizDocuments(),
      });
    }

    return authoringStore;
  }

  const authoringService = createAuthoringService({
    clock,
    quizStore: {
      async getQuizDocument(quizId) {
        return getAuthoringStore().quizStore.getQuizDocument(quizId);
      },
      async saveQuizDocument(document) {
        return getAuthoringStore().quizStore.saveQuizDocument(document);
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
        const bootstrap = await runtimeProvisioner.createRoom(input);
        state.roomsByCode.set(bootstrap.room.room_code, {
          bootstrap: null,
          room: bootstrap.room,
          questionSnapshots: bootstrap.questionSnapshots,
          optionSnapshots: bootstrap.optionSnapshots,
          questionState: null,
          players: [],
          acceptedSubmissions: [],
          latestOutcomes: {},
          leaderboard: null,
        });
        return { room_id: bootstrap.room.room_id, room_code: bootstrap.room.room_code };
      },
    },
  });

  function mustRoomSession(roomCode: string) {
    const session = state.roomsByCode.get(normalizeRoomCode(roomCode));
    if (!session) {
      throw new NotFoundError(`Room ${roomCode} was not found`);
    }
    return session;
  }

  function requireRoomHost(session: RoomSession, actor: AuthenticatedAuthor) {
    if (session.room.host_binding.clerk_user_id !== actor.clerkUserId) {
      throw new AuthorizationError('Only the room owner can manage this host flow');
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
    if (!question || session.room.lifecycle_state === 'lobby') {
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
      return session.room.lifecycle_state === 'finished' && session.latestOutcomes[roomPlayerId] ? 'accepted' : 'not_submitted';
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
      return ['start_game'];
    }
    if (!session.questionState) {
      return [];
    }
    switch (session.questionState.phase) {
      case 'question_open':
        return ['close_question'];
      case 'question_closed':
        return ['reveal'];
      case 'reveal':
        return ['show_leaderboard'];
      case 'leaderboard':
        return hasNextQuestion(session) ? ['next_question'] : ['finish_game'];
    }
  }

  function hasNextQuestion(session: RoomSession) {
    if (session.room.current_question_index === null) {
      return false;
    }
    return session.questionSnapshots.some((question) => question.question_index === session.room.current_question_index! + 1);
  }

  return {
    async listQuizSummaries(actor: AuthenticatedAuthor): Promise<DemoQuizSummary[]> {
      return getAuthoringStore().listQuizSummaries(actor);
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

    async publishQuiz({ actor, quizId }: { actor: AuthenticatedAuthor; quizId: string }) {
      return authoringService.publishQuiz({ actor, quizId });
    },

    async createRoom({ actor, quizId }: { actor: AuthenticatedAuthor; quizId: string }) {
      const bootstrap = await roomBootstrapService.createRoom({ actor, quizId });
      mustRoomSession(bootstrap.room_code).bootstrap = bootstrap;
      return bootstrap;
    },

    findHostRoomDetails({ actor, roomCode }: { actor: AuthenticatedAuthor; roomCode: string }) {
      const session = state.roomsByCode.get(normalizeRoomCode(roomCode));
      if (!session) {
        return null;
      }
      requireRoomHost(session, actor);
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
      const session = mustRoomSession(input.roomCode);
      requireRoomHost(session, input.actor);
      switch (input.action) {
        case 'start_game': {
          const started = runtimeGameplayService.startGame({ room: session.room, questionSnapshots: getQuestionSnapshotsForRoom(session) });
          session.room = started.room;
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
        case 'abort_game':
          throw new InvalidOperationError('Abort flow is out of scope for this initial application slice');
      }
      return this.getHostRoomState({ actor: input.actor, roomCode: input.roomCode });
    },

    joinRoom(input: { guestSessionId: string; roomCode: string; displayName: string }) {
      const command = playerJoinCommandSchema.parse({ room_code: input.roomCode, display_name: input.displayName });
      const normalizedRoomCode = normalizeRoomCode(command.room_code);
      const existingBinding = getGuestBinding(input.guestSessionId, normalizedRoomCode);
      if (existingBinding) {
        return existingBinding;
      }
      const session = mustRoomSession(normalizedRoomCode);
      const roomPlayerId = `player-${state.nextPlayerNumber}`;
      const resumeToken = `resume-${state.nextPlayerNumber}-${input.guestSessionId}`;
      const joinedPlayer = runtimeGameplayService.joinPlayer({
        room: session.room,
        players: session.players,
        roomPlayerId,
        displayName: command.display_name,
        resumeTokenHash: `hash:${resumeToken}`,
      });
      session.players = [...session.players, joinedPlayer];
      state.nextPlayerNumber += 1;
      const binding = { roomCode: normalizedRoomCode, roomPlayerId, resumeToken };
      setGuestBinding(input.guestSessionId, binding);
      return binding;
    },

    findPlayerRoomState(input: { guestSessionId: string; roomCode: string }) {
      const binding = getGuestBinding(input.guestSessionId, input.roomCode);
      if (!binding) {
        return null;
      }
      const session = mustRoomSession(binding.roomCode);
      const player = session.players.find((entry) => entry.room_player_id === binding.roomPlayerId);
      if (!player) {
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
      const question = getCurrentQuestionSnapshot(session);
      if (!session.questionState || !question) {
        throw new InvalidOperationError('No active question is available');
      }
      const accepted = runtimeGameplayService.acceptSubmission({
        room: session.room,
        questionState: session.questionState,
        questionSnapshot: question,
        optionSnapshots: getCurrentOptionSnapshots(session),
        roomPlayerId: binding.roomPlayerId,
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

const globalDemoAppKey = '__quizDemoAppService';

export function getDemoAppService() {
  const globalScope = globalThis as typeof globalThis & { [globalDemoAppKey]?: ReturnType<typeof createDemoAppService> };
  if (!globalScope[globalDemoAppKey]) {
    globalScope[globalDemoAppKey] = createDemoAppService();
  }
  return globalScope[globalDemoAppKey]!;
}