import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthenticatedAuthor } from '@/lib/server/authoring-service';
import { createAuthoringService } from '@/lib/server/authoring-service';
import {
  createSpacetimeAuthoringStore,
  type AuthoringSpacetimeClientFactory,
} from '@/lib/server/authoring-spacetimedb-store';
import { createRuntimeHostClaimSigner, verifyRuntimeHostClaimToken } from '@/lib/server/host-claim-signer';
import {
  createSpacetimeRuntimeBootstrapProvisioner,
  type RuntimeBootstrapProvisioner,
} from '@/lib/server/runtime-spacetimedb-bootstrap';
import { createDemoSeedQuizDocuments } from '@/lib/server/demo-seed';
import {
  isExpectedStructuredLogError,
  writeStructuredLog,
  type StructuredLogMetadata,
} from '@/lib/server/observability';
import { createRoomBootstrapService, type HostClaimSigner } from '@/lib/server/room-bootstrap-service';
import { createRuntimeGameplayService, type AcceptedAnswerSubmission } from '@/lib/server/runtime-gameplay-service';
import { AuthorizationError, InvalidOperationError, NotFoundError } from '@/lib/server/service-errors';
import {
  answerSubmissionCommandSchema,
  hostRoomStateSchema,
  playerJoinCommandSchema,
  playerReconnectCommandSchema,
  playerRoomStateSchema,
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

type AppClock = () => Date;

type AppQuizSummary = {
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
  resumeToken: string;
  resumeExpiresAt: string;
};

type QuestionDirection = 'up' | 'down';

type SaveQuestionInput = {
  actor: AuthenticatedAuthor;
  quizId: string;
  questionId: string;
  prompt: string;
  questionType: AuthoringQuizDocument['questions'][number]['question']['question_type'];
  basePoints: number;
  timeLimitSeconds?: number;
  shuffleAnswers?: boolean;
  options: Array<{
    optionId: string;
    text: string;
    isCorrect: boolean;
  }>;
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
  activeHostTransportSessionId: string | null;
  consumedHostClaimJtis: Set<string>;
};

type AppState = {
  roomsByCode: Map<string, RoomSession>;
  guestBindings: Map<string, Map<string, GuestBinding>>;
  nextPlayerNumber: number;
  nextClaimNumber: number;
};

type AppServiceDependencies = {
  authoringClientFactory?: AuthoringSpacetimeClientFactory;
  runtimeProvisioner?: RuntimeBootstrapProvisioner | null;
  hostClaimSigner?: HostClaimSigner | null;
  clock?: AppClock;
  seedDocuments?: AuthoringQuizDocument[];
};

export type AppService = ReturnType<typeof createDemoAppService>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

function createInitialState(): AppState {
  return {
    roomsByCode: new Map(),
    guestBindings: new Map(),
    nextPlayerNumber: 1,
    nextClaimNumber: 1,
  };
}

function createDemoHostClaimSigner(): HostClaimSigner {
  return {
    async signHostClaim(claims) {
      return `demo-host-claim:${claims.room_id}:${claims.jti}`;
    },
  };
}

function hashResumeToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function generateResumeToken() {
  return randomBytes(32).toString('hex');
}

function sortQuestions(document: AuthoringQuizDocument) {
  return document.questions.slice().sort((left, right) => left.question.position - right.question.position);
}

function sortOptions(entry: AuthoringQuizDocument['questions'][number]) {
  return entry.options.slice().sort((left, right) => left.position - right.position);
}

function moveItem<T>(items: T[], index: number, direction: QuestionDirection) {
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }

  const nextItems = items.slice();
  const [item] = nextItems.splice(index, 1);
  nextItems.splice(targetIndex, 0, item);
  return nextItems;
}

function normalizeOptions(
  options: AuthoringQuizDocument['questions'][number]['options'],
  questionId: string,
): AuthoringQuizDocument['questions'][number]['options'] {
  return options.map((option, index) => ({
    ...option,
    question_id: questionId,
    position: index + 1,
  }));
}

function normalizeQuestions(
  questions: AuthoringQuizDocument['questions'],
  now: string,
  touchQuestionTimestamps: boolean,
): AuthoringQuizDocument['questions'] {
  return questions.map((entry, index) => ({
    question: {
      ...entry.question,
      position: index + 1,
      updated_at: touchQuestionTimestamps ? now : entry.question.updated_at,
    },
    options: normalizeOptions(entry.options, entry.question.question_id),
  }));
}

export function createDemoAppService({
  authoringClientFactory,
  runtimeProvisioner = null,
  hostClaimSigner = createDemoHostClaimSigner(),
  clock = () => new Date(),
  seedDocuments = createDemoSeedQuizDocuments(),
}: AppServiceDependencies = {}) {
  const state = createInitialState();
  const runtimeGameplayService = createRuntimeGameplayService({ clock });
  let authoringStore: ReturnType<typeof createSpacetimeAuthoringStore> | null = null;
  let resolvedRuntimeProvisioner = runtimeProvisioner;
  let resolvedHostClaimSigner = hostClaimSigner;

  function getAuthoringStore() {
    if (!authoringStore) {
      authoringStore = createSpacetimeAuthoringStore({
        clientFactory: authoringClientFactory,
        seedDocuments,
      });
    }

    return authoringStore;
  }

  function getRuntimeProvisioner() {
    if (!resolvedRuntimeProvisioner) {
      resolvedRuntimeProvisioner = createSpacetimeRuntimeBootstrapProvisioner();
    }

    return resolvedRuntimeProvisioner;
  }

  function getHostClaimSigner() {
    if (!resolvedHostClaimSigner) {
      resolvedHostClaimSigner = createRuntimeHostClaimSigner();
    }

    return resolvedHostClaimSigner;
  }

  function logRuntimeEvent(event: string, metadata: StructuredLogMetadata) {
    writeStructuredLog({ event, metadata });
  }

  function logRuntimeFailure(event: string, error: unknown, metadata: StructuredLogMetadata) {
    writeStructuredLog({
      event,
      error,
      metadata,
      level: isExpectedStructuredLogError(error) ? 'warn' : 'error',
    });
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
        return getHostClaimSigner().signHostClaim(claims);
      },
    },
    roomProvisioner: {
      async createRoom(input) {
        const bootstrap = await getRuntimeProvisioner().createRoom(input);
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
          activeHostTransportSessionId: null,
          consumedHostClaimJtis: new Set<string>(),
        });
        return { room_id: bootstrap.room.room_id, room_code: bootstrap.room.room_code };
      },
    },
  });

  async function saveUpdatedQuizDocument(input: {
    actor: AuthenticatedAuthor;
    quizId: string;
    mutate: (current: AuthoringQuizDocument, now: string) => AuthoringQuizDocument;
  }) {
    const current = await authoringService.loadOwnedQuizDocument({ actor: input.actor, quizId: input.quizId });
    const now = clock().toISOString();
    const nextDocument = input.mutate(clone(current), now);
    return authoringService.saveQuizDocument({ actor: input.actor, document: nextDocument });
  }

  function mustRoomSession(roomCode: string) {
    const session = state.roomsByCode.get(normalizeRoomCode(roomCode));
    if (!session) {
      throw new NotFoundError(`Room ${roomCode} was not found`);
    }
    return session;
  }

  function requireRoomHostOwner(session: RoomSession, actor: AuthenticatedAuthor) {
    if (session.room.host_binding.clerk_user_id !== actor.clerkUserId) {
      throw new AuthorizationError('Only the room owner can manage this host flow');
    }
  }

  function requireActiveHostBinding(session: RoomSession, transportSessionId: string) {
    if (!session.activeHostTransportSessionId) {
      throw new AuthorizationError('Claim host authority before managing this room');
    }
    if (session.activeHostTransportSessionId !== transportSessionId) {
      throw new AuthorizationError('This host session is no longer active for the room');
    }
  }

  function requireRoomHost(session: RoomSession, actor: AuthenticatedAuthor, transportSessionId: string) {
    requireRoomHostOwner(session, actor);
    requireActiveHostBinding(session, transportSessionId);
  }

  function requireTransportSessionId(transportSessionId: string) {
    const normalized = transportSessionId.trim();
    if (!normalized) {
      throw new AuthorizationError('A transport session is required to bind host authority');
    }
    return normalized;
  }

  function setGuestBinding(guestSessionId: string, binding: GuestBinding) {
    const current = state.guestBindings.get(guestSessionId) ?? new Map<string, GuestBinding>();
    current.set(binding.roomCode, binding);
    state.guestBindings.set(guestSessionId, current);
  }

  function deleteGuestBinding(guestSessionId: string, roomCode: string) {
    const current = state.guestBindings.get(guestSessionId);
    if (!current) {
      return;
    }
    current.delete(normalizeRoomCode(roomCode));
    if (current.size === 0) {
      state.guestBindings.delete(guestSessionId);
    }
  }

  function getGuestBinding(guestSessionId: string, roomCode: string) {
    return state.guestBindings.get(guestSessionId)?.get(normalizeRoomCode(roomCode)) ?? null;
  }

  function clearReplacedGuestBindings(roomCode: string, roomPlayerId: string, exceptGuestSessionId: string) {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    for (const [guestSessionId, bindings] of state.guestBindings) {
      if (guestSessionId === exceptGuestSessionId) {
        continue;
      }
      const binding = bindings.get(normalizedRoomCode);
      if (!binding || binding.roomPlayerId !== roomPlayerId) {
        continue;
      }
      bindings.delete(normalizedRoomCode);
      if (bindings.size === 0) {
        state.guestBindings.delete(guestSessionId);
      }
    }
  }

  function resolvePlayerForBinding(session: RoomSession, binding: GuestBinding) {
    const player = session.players.find((entry) => entry.room_player_id === binding.roomPlayerId);
    if (!player) {
      return null;
    }
    return hashResumeToken(binding.resumeToken) === player.resume_token_hash ? player : null;
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
    const gameplayActive = session.room.lifecycle_state === 'in_progress';
    return {
      room_id: session.room.room_id,
      room_code: session.room.room_code,
      lifecycle_state: session.room.lifecycle_state,
      question_index: session.room.current_question_index,
      question_phase: gameplayActive ? session.questionState?.phase ?? null : null,
      question_deadline_at: gameplayActive ? session.questionState?.deadline_at ?? null : null,
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
    if (session.room.lifecycle_state === 'lobby') {
      return 'not_submitted';
    }
    if (session.room.lifecycle_state !== 'in_progress') {
      return session.latestOutcomes[roomPlayerId] ? 'accepted' : 'no_answer';
    }
    const currentQuestionIndex = session.room.current_question_index;
    if (currentQuestionIndex === null) {
      return 'not_submitted';
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
    if (!session.questionState) {
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

  function currentEpochSeconds() {
    return Math.floor(clock().getTime() / 1000);
  }

  function syncRoomLifecycle(session: RoomSession) {
    const currentTime = clock().toISOString();

    while (true) {
      if (session.room.lifecycle_state === 'in_progress' && Date.parse(currentTime) > Date.parse(session.room.expires_at)) {
        session.room = runtimeGameplayService.abortGame({ room: session.room, endedAt: session.room.expires_at });
        session.questionState = null;
        session.acceptedSubmissions = [];
        session.leaderboard = null;
        continue;
      }

      if (
        session.room.lifecycle_state !== 'in_progress' &&
        session.room.lifecycle_state !== 'expired' &&
        Date.parse(currentTime) > Date.parse(session.room.expires_at)
      ) {
        session.room = {
          ...session.room,
          lifecycle_state: 'expired',
        };
        session.questionState = null;
        session.acceptedSubmissions = [];
        session.latestOutcomes = {};
        session.leaderboard = null;
      }

      return;
    }
  }

  return {
    async listQuizSummaries(actor: AuthenticatedAuthor): Promise<AppQuizSummary[]> {
      return getAuthoringStore().listQuizSummaries(actor);
    },

    listActiveRooms(actor: AuthenticatedAuthor) {
      return [...state.roomsByCode.values()]
        .filter((session) => session.room.host_binding.clerk_user_id === actor.clerkUserId)
        .map((session) => {
          syncRoomLifecycle(session);
          return session;
        })
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

    async addQuestion({ actor, quizId }: { actor: AuthenticatedAuthor; quizId: string }) {
      return saveUpdatedQuizDocument({
        actor,
        quizId,
        mutate: (current, now) => {
          const questionId = `question-${randomUUID()}`;
          const optionOneId = `option-${randomUUID()}`;
          const optionTwoId = `option-${randomUUID()}`;
          const nextPosition = current.questions.length + 1;
          const nextQuestions = current.questions.concat({
            question: {
              question_id: questionId,
              quiz_id: current.quiz.quiz_id,
              position: nextPosition,
              prompt: `Question ${nextPosition}`,
              question_type: 'single_choice',
              evaluation_policy: 'exact_match',
              base_points: 100,
              time_limit_seconds: current.quiz.default_question_time_limit_seconds,
              shuffle_answers: current.quiz.shuffle_answers_default,
              created_at: now,
              updated_at: now,
            },
            options: [
              { option_id: optionOneId, question_id: questionId, position: 1, text: 'Option 1', is_correct: true },
              { option_id: optionTwoId, question_id: questionId, position: 2, text: 'Option 2', is_correct: false },
            ],
          });

          return {
            ...current,
            questions: normalizeQuestions(nextQuestions, now, true),
          };
        },
      });
    },

    async saveQuestion(input: SaveQuestionInput) {
      return saveUpdatedQuizDocument({
        actor: input.actor,
        quizId: input.quizId,
        mutate: (current, now) => {
          const existing = current.questions.find((entry) => entry.question.question_id === input.questionId);
          if (!existing) {
            throw new NotFoundError(`Question ${input.questionId} was not found`);
          }

          const nextOptions = input.options.map((option, index) => {
            const existingOption = existing.options.find((entry) => entry.option_id === option.optionId);
            if (!existingOption) {
              throw new NotFoundError(`Option ${option.optionId} was not found`);
            }

            return {
              ...existingOption,
              question_id: input.questionId,
              position: index + 1,
              text: option.text.trim(),
              is_correct: option.isCorrect,
            };
          });

          return {
            ...current,
            questions: normalizeQuestions(
              current.questions.map((entry) =>
                entry.question.question_id === input.questionId
                  ? {
                      question: {
                        ...entry.question,
                        prompt: input.prompt.trim(),
                        question_type: input.questionType,
                        evaluation_policy: 'exact_match',
                        base_points: input.basePoints,
                        time_limit_seconds: input.timeLimitSeconds,
                        shuffle_answers: input.shuffleAnswers,
                        updated_at: now,
                      },
                      options: normalizeOptions(nextOptions, input.questionId),
                    }
                  : entry,
              ),
              now,
              false,
            ),
          };
        },
      });
    },

    async moveQuestion(input: { actor: AuthenticatedAuthor; quizId: string; questionId: string; direction: QuestionDirection }) {
      return saveUpdatedQuizDocument({
        actor: input.actor,
        quizId: input.quizId,
        mutate: (current, now) => {
          const orderedQuestions = sortQuestions(current);
          const currentIndex = orderedQuestions.findIndex((entry) => entry.question.question_id === input.questionId);
          if (currentIndex === -1) {
            throw new NotFoundError(`Question ${input.questionId} was not found`);
          }

          return {
            ...current,
            questions: normalizeQuestions(moveItem(orderedQuestions, currentIndex, input.direction), now, true),
          };
        },
      });
    },

    async deleteQuestion(input: { actor: AuthenticatedAuthor; quizId: string; questionId: string }) {
      return saveUpdatedQuizDocument({
        actor: input.actor,
        quizId: input.quizId,
        mutate: (current, now) => {
          const nextQuestions = current.questions.filter((entry) => entry.question.question_id !== input.questionId);
          if (nextQuestions.length === current.questions.length) {
            throw new NotFoundError(`Question ${input.questionId} was not found`);
          }

          return {
            ...current,
            questions: normalizeQuestions(nextQuestions, now, true),
          };
        },
      });
    },

    async addOption(input: { actor: AuthenticatedAuthor; quizId: string; questionId: string }) {
      return saveUpdatedQuizDocument({
        actor: input.actor,
        quizId: input.quizId,
        mutate: (current, now) => {
          const targetQuestion = current.questions.find((entry) => entry.question.question_id === input.questionId);
          if (!targetQuestion) {
            throw new NotFoundError(`Question ${input.questionId} was not found`);
          }

          return {
            ...current,
            questions: normalizeQuestions(
              current.questions.map((entry) => {
                if (entry.question.question_id !== input.questionId) {
                  return entry;
                }

                const orderedOptions = sortOptions(entry);
                const nextOptions = orderedOptions.concat({
                  option_id: `option-${randomUUID()}`,
                  question_id: input.questionId,
                  position: orderedOptions.length + 1,
                  text: `Option ${orderedOptions.length + 1}`,
                  is_correct: false,
                });

                return {
                  question: {
                    ...entry.question,
                    updated_at: now,
                  },
                  options: normalizeOptions(nextOptions, input.questionId),
                };
              }),
              now,
              false,
            ),
          };
        },
      });
    },

    async moveOption(input: {
      actor: AuthenticatedAuthor;
      quizId: string;
      questionId: string;
      optionId: string;
      direction: QuestionDirection;
    }) {
      return saveUpdatedQuizDocument({
        actor: input.actor,
        quizId: input.quizId,
        mutate: (current, now) => {
          const targetQuestion = current.questions.find((entry) => entry.question.question_id === input.questionId);
          if (!targetQuestion) {
            throw new NotFoundError(`Question ${input.questionId} was not found`);
          }

          return {
            ...current,
            questions: normalizeQuestions(
              current.questions.map((entry) => {
                if (entry.question.question_id !== input.questionId) {
                  return entry;
                }

                const orderedOptions = sortOptions(entry);
                const currentIndex = orderedOptions.findIndex((option) => option.option_id === input.optionId);
                if (currentIndex === -1) {
                  throw new NotFoundError(`Option ${input.optionId} was not found`);
                }

                return {
                  question: {
                    ...entry.question,
                    updated_at: now,
                  },
                  options: normalizeOptions(moveItem(orderedOptions, currentIndex, input.direction), input.questionId),
                };
              }),
              now,
              false,
            ),
          };
        },
      });
    },

    async deleteOption(input: { actor: AuthenticatedAuthor; quizId: string; questionId: string; optionId: string }) {
      return saveUpdatedQuizDocument({
        actor: input.actor,
        quizId: input.quizId,
        mutate: (current, now) => {
          const targetQuestion = current.questions.find((entry) => entry.question.question_id === input.questionId);
          if (!targetQuestion) {
            throw new NotFoundError(`Question ${input.questionId} was not found`);
          }

          return {
            ...current,
            questions: normalizeQuestions(
              current.questions.map((entry) => {
                if (entry.question.question_id !== input.questionId) {
                  return entry;
                }

                const nextOptions = entry.options.filter((option) => option.option_id !== input.optionId);
                if (nextOptions.length === entry.options.length) {
                  throw new NotFoundError(`Option ${input.optionId} was not found`);
                }

                return {
                  question: {
                    ...entry.question,
                    updated_at: now,
                  },
                  options: normalizeOptions(nextOptions, input.questionId),
                };
              }),
              now,
              false,
            ),
          };
        },
      });
    },

    async publishQuiz({ actor, quizId }: { actor: AuthenticatedAuthor; quizId: string }) {
      return authoringService.publishQuiz({ actor, quizId });
    },

    async createRoom({ actor, quizId }: { actor: AuthenticatedAuthor; quizId: string }) {
      try {
        const bootstrap = await roomBootstrapService.createRoom({ actor, quizId });
        mustRoomSession(bootstrap.room_code).bootstrap = bootstrap;
        logRuntimeEvent('runtime.create_room', {
          roomId: bootstrap.room_id,
          roomCode: bootstrap.room_code,
          sourceQuizId: bootstrap.source_quiz_id,
          clerkUserId: actor.clerkUserId,
        });
        return bootstrap;
      } catch (error) {
        logRuntimeFailure('runtime.create_room.failed', error, {
          quizId,
          clerkUserId: actor.clerkUserId,
        });
        throw error;
      }
    },

    claimHost(input: {
      actor: AuthenticatedAuthor;
      roomCode: string;
      hostClaimToken: string;
      transportSessionId: string;
    }) {
      const normalizedRoomCode = normalizeRoomCode(input.roomCode);
      let session: RoomSession | null = null;

      try {
        session = mustRoomSession(normalizedRoomCode);
        const transportSessionId = requireTransportSessionId(input.transportSessionId);
        requireRoomHostOwner(session, input.actor);

        const claims = verifyRuntimeHostClaimToken(input.hostClaimToken);
        if (claims.exp <= currentEpochSeconds()) {
          throw new AuthorizationError('Host claim token has expired');
        }
        if (claims.room_id !== session.room.room_id) {
          throw new AuthorizationError('Host claim token does not match this room');
        }
        if (claims.clerk_user_id !== input.actor.clerkUserId || claims.clerk_session_id !== input.actor.clerkSessionId) {
          throw new AuthorizationError('Host claim token does not match the current signed-in author session');
        }
        if (session.consumedHostClaimJtis.has(claims.jti)) {
          throw new AuthorizationError('Host claim token has already been consumed');
        }

        session.consumedHostClaimJtis.add(claims.jti);
        if (session.activeHostTransportSessionId && session.activeHostTransportSessionId !== transportSessionId) {
          session.room = {
            ...session.room,
            host_binding: {
              ...session.room.host_binding,
              host_binding_version: session.room.host_binding.host_binding_version + 1,
            },
          };
        }
        session.activeHostTransportSessionId = transportSessionId;

        return this.getHostRoomState({
          actor: input.actor,
          roomCode: normalizedRoomCode,
          transportSessionId,
        });
      } catch (error) {
        logRuntimeFailure('runtime.host_claim.validation_failed', error, {
          roomId: session?.room.room_id ?? null,
          roomCode: normalizedRoomCode,
          clerkUserId: input.actor.clerkUserId,
        });
        throw error;
      }
    },

    findHostRoomDetails({ actor, roomCode, transportSessionId }: { actor: AuthenticatedAuthor; roomCode: string; transportSessionId: string }) {
      const session = state.roomsByCode.get(normalizeRoomCode(roomCode));
      if (!session) {
        return null;
      }
      syncRoomLifecycle(session);
      requireRoomHost(session, actor, requireTransportSessionId(transportSessionId));
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

    getHostRoomState({ actor, roomCode, transportSessionId }: { actor: AuthenticatedAuthor; roomCode: string; transportSessionId: string }) {
      const details = this.findHostRoomDetails({ actor, roomCode, transportSessionId });
      if (!details) {
        throw new NotFoundError(`Room ${roomCode} was not found`);
      }
      return details.state;
    },

    performHostAction(input: {
      actor: AuthenticatedAuthor;
      roomCode: string;
      action: HostAllowedAction;
      transportSessionId: string;
    }) {
      const normalizedRoomCode = normalizeRoomCode(input.roomCode);
      let session: RoomSession | null = null;
      let previousLifecycleState: RuntimeRoom['lifecycle_state'] | null = null;
      let previousQuestionPhase: RuntimeQuestionState['phase'] | null = null;

      try {
        session = mustRoomSession(normalizedRoomCode);
        requireRoomHost(session, input.actor, requireTransportSessionId(input.transportSessionId));
        syncRoomLifecycle(session);
        previousLifecycleState = session.room.lifecycle_state;
        previousQuestionPhase = session.questionState?.phase ?? null;

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
            session.room = runtimeGameplayService.abortGame({ room: session.room });
            session.questionState = null;
            session.acceptedSubmissions = [];
            session.leaderboard = null;
            break;
        }

        const nextState = this.getHostRoomState({
          actor: input.actor,
          roomCode: normalizedRoomCode,
          transportSessionId: input.transportSessionId,
        });

        logRuntimeEvent('runtime.lifecycle_transition', {
          roomId: session.room.room_id,
          roomCode: normalizedRoomCode,
          clerkUserId: input.actor.clerkUserId,
          action: input.action,
          previousLifecycleState,
          previousQuestionPhase,
          resultingLifecycleState: nextState.shared_room.lifecycle_state,
          resultingQuestionPhase: nextState.shared_room.question_phase,
        });

        return nextState;
      } catch (error) {
        logRuntimeFailure('runtime.lifecycle_transition.failed', error, {
          roomId: session?.room.room_id ?? null,
          roomCode: normalizedRoomCode,
          clerkUserId: input.actor.clerkUserId,
          action: input.action,
          previousLifecycleState,
          previousQuestionPhase,
        });
        throw error;
      }
    },

    joinRoom(input: { guestSessionId: string; roomCode: string; displayName: string }) {
      let session: RoomSession | null = null;
      let normalizedRoomCode = normalizeRoomCode(input.roomCode);

      try {
        const command = playerJoinCommandSchema.parse({ room_code: input.roomCode, display_name: input.displayName });
        normalizedRoomCode = normalizeRoomCode(command.room_code);
        const existingBinding = getGuestBinding(input.guestSessionId, normalizedRoomCode);
        if (existingBinding) {
          const existingSession = state.roomsByCode.get(normalizedRoomCode);
          if (existingSession) {
            syncRoomLifecycle(existingSession);
          }
          if (existingSession && resolvePlayerForBinding(existingSession, existingBinding)) {
            logRuntimeEvent('runtime.player_join', {
              roomId: existingBinding.roomId,
              roomCode: normalizedRoomCode,
              roomPlayerId: existingBinding.roomPlayerId,
              lifecycleState: existingSession.room.lifecycle_state,
              bindingReused: true,
            });
            return existingBinding;
          }
          deleteGuestBinding(input.guestSessionId, normalizedRoomCode);
        }
        session = mustRoomSession(normalizedRoomCode);
        syncRoomLifecycle(session);
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
        const binding = {
          roomId: session.room.room_id,
          roomCode: normalizedRoomCode,
          roomPlayerId,
          resumeToken,
          resumeExpiresAt: session.room.expires_at,
        };
        setGuestBinding(input.guestSessionId, binding);
        logRuntimeEvent('runtime.player_join', {
          roomId: session.room.room_id,
          roomCode: normalizedRoomCode,
          roomPlayerId,
          lifecycleState: session.room.lifecycle_state,
          bindingReused: false,
        });
        return binding;
      } catch (error) {
        logRuntimeFailure('runtime.player_join.failed', error, {
          roomId: session?.room.room_id ?? null,
          roomCode: normalizedRoomCode,
        });
        throw error;
      }
    },

    reconnectPlayer(input: { guestSessionId: string; roomCode: string; roomId: string; roomPlayerId: string; resumeToken: string }) {
      const normalizedRoomCode = normalizeRoomCode(input.roomCode);
      let session: RoomSession | null = null;

      try {
        session = mustRoomSession(normalizedRoomCode);
        syncRoomLifecycle(session);
        const reconnected = runtimeGameplayService.reconnectPlayer({
          room: session.room,
          players: session.players,
          command: playerReconnectCommandSchema.parse({
            room_id: input.roomId,
            room_player_id: input.roomPlayerId,
            resume_token: input.resumeToken,
          }),
          generateResumeToken,
          hashResumeToken,
        });
        session.players = reconnected.updatedPlayers;
        clearReplacedGuestBindings(normalizedRoomCode, input.roomPlayerId, input.guestSessionId);
        const binding = {
          roomId: session.room.room_id,
          roomCode: normalizedRoomCode,
          roomPlayerId: input.roomPlayerId,
          resumeToken: reconnected.resumeToken,
          resumeExpiresAt: reconnected.resumeExpiresAt,
        };
        setGuestBinding(input.guestSessionId, binding);
        logRuntimeEvent('runtime.player_reconnect', {
          roomId: session.room.room_id,
          roomCode: normalizedRoomCode,
          roomPlayerId: input.roomPlayerId,
          lifecycleState: session.room.lifecycle_state,
          questionPhase: session.questionState?.phase ?? null,
        });
        return binding;
      } catch (error) {
        logRuntimeFailure('runtime.player_reconnect.failed', error, {
          roomId: session?.room.room_id ?? input.roomId,
          roomCode: normalizedRoomCode,
          roomPlayerId: input.roomPlayerId,
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
      syncRoomLifecycle(session);
      const player = resolvePlayerForBinding(session, binding);
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
      syncRoomLifecycle(session);
      const player = resolvePlayerForBinding(session, binding);
      if (!player) {
        throw new AuthorizationError('This player session has been replaced. Reconnect before submitting answers.');
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

function shouldSeedLocalFixtureDocumentsByDefault(source: NodeJS.ProcessEnv = process.env) {
  return source.NEXT_PUBLIC_APP_ENV?.trim() === 'local';
}

export function createAppService(dependencies: Omit<AppServiceDependencies, 'seedDocuments'> & { seedDocuments?: AuthoringQuizDocument[] } = {}) {
  return createDemoAppService({
    ...dependencies,
    hostClaimSigner: dependencies.hostClaimSigner ?? null,
    seedDocuments:
      dependencies.seedDocuments ?? (shouldSeedLocalFixtureDocumentsByDefault() ? createDemoSeedQuizDocuments() : []),
  });
}

const globalAppKey = '__quizAppService';

export function getAppService() {
  const globalScope = globalThis as typeof globalThis & { [globalAppKey]?: AppService };
  if (!globalScope[globalAppKey]) {
    globalScope[globalAppKey] = createAppService();
  }
  return globalScope[globalAppKey]!;
}

const globalDemoAppKey = '__quizDemoAppService';

export function getDemoAppService() {
  const globalScope = globalThis as typeof globalThis & { [globalDemoAppKey]?: AppService };
  if (!globalScope[globalDemoAppKey]) {
    globalScope[globalDemoAppKey] = createDemoAppService();
  }
  return globalScope[globalDemoAppKey]!;
}