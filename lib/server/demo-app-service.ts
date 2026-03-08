import { createHash, randomBytes } from 'node:crypto';
import type { AuthenticatedAuthor, AuthoringQuizStore } from '@/lib/server/authoring-service';
import { createAuthoringService } from '@/lib/server/authoring-service';
import {
  addOptionToQuizDocument,
  addQuestionToQuizDocument,
  deleteOptionFromQuizDocument,
  deleteQuestionFromQuizDocument,
  moveOptionInQuizDocument,
  moveQuestionInQuizDocument,
  saveQuestionInQuizDocument,
  type QuestionDirection,
  type SaveQuestionDocumentInput,
} from '@/lib/server/demo-app-authoring-helpers';
import {
  buildActiveQuestion,
  buildHostAllowedActions,
  buildPlayerSubmissionStatus,
  buildSharedRoom,
  currentLeaderboard,
  getCurrentOptionSnapshots,
  getCurrentQuestionSnapshot,
  getQuestionSnapshotsForRoom,
} from '@/lib/server/demo-app-room-state';
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
  buildQuizImageObjectKey,
  QUIZ_IMAGE_STORED_BYTES_CAP,
  storeQuizImageUpload,
  validateQuizImageFile,
} from '@/lib/server/quiz-image-assets';
import { createDefaultQuizImageStore, type QuizImageStore } from '@/lib/server/quiz-image-store';
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
  authoringQuizDocumentSchema,
  hostRoomStateSchema,
  playerJoinCommandSchema,
  playerReconnectCommandSchema,
  playerRoomStateSchema,
  type AuthoringQuizDocument,
  type CreateRoomResponse,
  type HostAllowedAction,
  type HostRoomState,
  type PlayerLatestOutcome,
  type QuizImageAssetReference,
  type RuntimeQuestionOptionSnapshot,
  type RuntimeQuestionSnapshot,
  type RuntimeQuestionState,
  type RuntimeRoom,
  type RuntimeRoomPlayer,
  runtimeRoomSchema,
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
  resumeVersion: number;
};

type PlayerSessionBinding = GuestBinding & {
  resumeToken: string;
  resumeExpiresAt: string;
};

type SaveQuestionInput = { actor: AuthenticatedAuthor; quizId: string } & SaveQuestionDocumentInput;

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
  quizImageStore?: QuizImageStore;
  saveQuizDocumentOverride?: AuthoringQuizStore['saveQuizDocument'];
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
  return createRuntimeHostClaimSigner();
}

function hashResumeToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function generateResumeToken() {
  return randomBytes(32).toString('hex');
}

export function createDemoAppService({
  authoringClientFactory,
  runtimeProvisioner = null,
  hostClaimSigner = createDemoHostClaimSigner(),
  clock = () => new Date(),
  quizImageStore = createDefaultQuizImageStore(),
  saveQuizDocumentOverride,
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
        if (saveQuizDocumentOverride) {
          return saveQuizDocumentOverride(document);
        }
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

  function mustQuestionDocument(document: AuthoringQuizDocument, questionId: string) {
    const entry = document.questions.find((question) => question.question.question_id === questionId);
    if (!entry) {
      throw new NotFoundError(`Question ${questionId} was not found`);
    }
    return entry;
  }

  function mustOptionDocument(document: AuthoringQuizDocument, questionId: string, optionId: string) {
    const entry = mustQuestionDocument(document, questionId);
    const option = entry.options.find((candidate) => candidate.option_id === optionId);
    if (!option) {
      throw new NotFoundError(`Option ${optionId} was not found`);
    }
    return option;
  }

  function findQuizImageReference(document: AuthoringQuizDocument, objectKey: string) {
    for (const entry of document.questions) {
      if (entry.question.image?.object_key === objectKey) {
        return entry.question.image;
      }
      const option = entry.options.find((candidate) => candidate.image?.object_key === objectKey);
      if (option?.image) {
        return option.image;
      }
    }
    return null;
  }

  function findActiveQuestionImageReference(session: RoomSession, objectKey: string) {
    const activeQuestion = buildActiveQuestion(session);
    if (activeQuestion?.image?.object_key === objectKey) {
      return activeQuestion.image;
    }
    return activeQuestion?.display_options.find((option) => option.image?.object_key === objectKey)?.image ?? null;
  }

  function isRoomStillReadable(session: RoomSession, currentTime = Date.parse(clock().toISOString())) {
    if (session.room.lifecycle_state === 'expired') {
      return false;
    }
    if (
      (session.room.lifecycle_state === 'finished' || session.room.lifecycle_state === 'aborted') &&
      currentTime > Date.parse(session.room.expires_at)
    ) {
      return false;
    }
    return true;
  }

  function expireRoomIfReadabilityEnded(session: RoomSession, currentTime = Date.parse(clock().toISOString())) {
    if (session.room.lifecycle_state === 'expired') {
      return true;
    }
    if (
      (session.room.lifecycle_state === 'finished' || session.room.lifecycle_state === 'aborted') &&
      currentTime > Date.parse(session.room.expires_at)
    ) {
      session.room = runtimeRoomSchema.parse({
        ...session.room,
        lifecycle_state: 'expired',
      });
      return true;
    }
    return false;
  }

  function collectRoomSnapshotImageReferences(session: RoomSession) {
    const references = new Map<string, QuizImageAssetReference>();
    for (const question of session.questionSnapshots) {
      if (question.image) {
        references.set(question.image.object_key, question.image);
      }
    }
    for (const option of session.optionSnapshots) {
      if (option.image) {
        references.set(option.image.object_key, option.image);
      }
    }
    return [...references.values()];
  }

  function doesReadableRoomStillReferenceObjectKey(quizId: string, objectKey: string) {
    const currentTime = Date.parse(clock().toISOString());
    return [...state.roomsByCode.values()].some((session) => {
      if (session.room.source_quiz_id !== quizId) {
        return false;
      }
      if (!isRoomStillReadable(session, currentTime)) {
        return false;
      }
      return (
        session.questionSnapshots.some((question) => question.image?.object_key === objectKey) ||
        session.optionSnapshots.some((option) => option.image?.object_key === objectKey)
      );
    });
  }

  function reclaimableQuizImageBytes(input: {
    quizId: string;
    document: AuthoringQuizDocument;
    reference: QuizImageAssetReference | null | undefined;
  }) {
    if (!input.reference) {
      return 0;
    }
    if (findQuizImageReference(input.document, input.reference.object_key)) {
      return 0;
    }
    if (doesReadableRoomStillReferenceObjectKey(input.quizId, input.reference.object_key)) {
      return 0;
    }
    return input.reference.bytes;
  }

  async function reclaimStaleQuizImageObject(input: {
    quizId: string;
    document: AuthoringQuizDocument;
    reference: QuizImageAssetReference | null | undefined;
  }) {
    if (reclaimableQuizImageBytes(input) < 1 || !input.reference) {
      return;
    }
    await quizImageStore.deleteObject({ objectKey: input.reference.object_key });
  }

  async function reclaimDeferredQuizImageObjects() {
    const currentTime = Date.parse(clock().toISOString());
    const documentsByQuizId = new Map<string, AuthoringQuizDocument>();
    const processedObjectKeys = new Set<string>();

    for (const session of state.roomsByCode.values()) {
      if (isRoomStillReadable(session, currentTime)) {
        continue;
      }

      expireRoomIfReadabilityEnded(session, currentTime);
      const quizId = session.room.source_quiz_id;
      let document = documentsByQuizId.get(quizId);
      if (!document) {
        const stored = await getAuthoringStore().quizStore.getQuizDocument(quizId);
        if (!stored) {
          continue;
        }
        document = authoringQuizDocumentSchema.parse(stored);
        documentsByQuizId.set(quizId, document);
      }

      for (const reference of collectRoomSnapshotImageReferences(session)) {
        if (processedObjectKeys.has(reference.object_key)) {
          continue;
        }
        processedObjectKeys.add(reference.object_key);
        await reclaimStaleQuizImageObject({ quizId, document, reference });
      }
    }
  }

  async function assertWithinQuizImageStorageCap(incomingBytes: number, reclaimableBytes = 0) {
    const currentStoredBytes = await quizImageStore.getStoredBytes();
    if (currentStoredBytes + incomingBytes - reclaimableBytes > QUIZ_IMAGE_STORED_BYTES_CAP) {
      throw new InvalidOperationError('Quiz image storage is full. Uploading this file would exceed the 8 GiB limit.');
    }
  }

  async function replaceQuizImageWithinQuotaLock(input: {
    actor: AuthenticatedAuthor;
    quizId: string;
    uploaded: Awaited<ReturnType<typeof storeQuizImageUpload>>;
    buildNextDocument(current: AuthoringQuizDocument): {
      nextDocument: AuthoringQuizDocument;
      previousImage: QuizImageAssetReference | null | undefined;
    };
  }) {
    return quizImageStore.runWithQuotaLock(async () => {
      await reclaimDeferredQuizImageObjects();

      const current = await authoringService.loadOwnedQuizDocument({ actor: input.actor, quizId: input.quizId });
      const { nextDocument, previousImage } = input.buildNextDocument(current);

      await assertWithinQuizImageStorageCap(
        input.uploaded.bytes,
        reclaimableQuizImageBytes({ quizId: input.quizId, document: nextDocument, reference: previousImage }),
      );

      await quizImageStore.putObject({
        objectKey: input.uploaded.object_key,
        contentType: input.uploaded.content_type,
        data: input.uploaded.data,
      });

      try {
        const saved = await authoringService.saveQuizDocument({
          actor: input.actor,
          document: nextDocument,
        });
        await reclaimStaleQuizImageObject({ quizId: input.quizId, document: saved, reference: previousImage });
        return saved;
      } catch (error) {
        await quizImageStore.deleteObject({ objectKey: input.uploaded.object_key });
        throw error;
      }
    });
  }

  async function readStoredQuizImageAsset(reference: QuizImageAssetReference) {
    const asset = await quizImageStore.getObject({ objectKey: reference.object_key });
    if (!asset) {
      throw new NotFoundError(`Image asset ${reference.object_key} bytes were not found`);
    }
    return {
      ...reference,
      bytes: asset.bytes,
      content_type: asset.content_type,
      data: asset.data,
    };
  }

  async function replaceQuestionImage(input: { actor: AuthenticatedAuthor; quizId: string; questionId: string; file: File }) {
    validateQuizImageFile(input.file);
    const uploaded = await storeQuizImageUpload({
      file: input.file,
      objectKey: buildQuizImageObjectKey({
        quizId: input.quizId,
        questionId: input.questionId,
        contentType: input.file.type as QuizImageAssetReference['content_type'],
      }),
    });
    return replaceQuizImageWithinQuotaLock({
      actor: input.actor,
      quizId: input.quizId,
      uploaded,
      buildNextDocument(current) {
        const currentQuestion = mustQuestionDocument(current, input.questionId);
        const previousImage = currentQuestion.question.image;
        return {
          previousImage,
          nextDocument: {
            ...current,
            questions: current.questions.map((entry) =>
              entry.question.question_id === input.questionId
                ? {
                    ...entry,
                    question: {
                      ...entry.question,
                      image: {
                        storage_provider: uploaded.storage_provider,
                        object_key: uploaded.object_key,
                        content_type: uploaded.content_type,
                        bytes: uploaded.bytes,
                        width: uploaded.width,
                        height: uploaded.height,
                      },
                    },
                  }
                : entry,
            ),
          },
        };
      },
    });
  }

  async function replaceOptionImage(input: {
    actor: AuthenticatedAuthor;
    quizId: string;
    questionId: string;
    optionId: string;
    file: File;
  }) {
    validateQuizImageFile(input.file);
    const uploaded = await storeQuizImageUpload({
      file: input.file,
      objectKey: buildQuizImageObjectKey({
        quizId: input.quizId,
        questionId: input.questionId,
        optionId: input.optionId,
        contentType: input.file.type as QuizImageAssetReference['content_type'],
      }),
    });
    return replaceQuizImageWithinQuotaLock({
      actor: input.actor,
      quizId: input.quizId,
      uploaded,
      buildNextDocument(current) {
        const currentOption = mustOptionDocument(current, input.questionId, input.optionId);
        const previousImage = currentOption.image;
        return {
          previousImage,
          nextDocument: {
            ...current,
            questions: current.questions.map((entry) =>
              entry.question.question_id === input.questionId
                ? {
                    ...entry,
                    options: entry.options.map((option) =>
                      option.option_id === input.optionId
                        ? {
                            ...option,
                            image: {
                              storage_provider: uploaded.storage_provider,
                              object_key: uploaded.object_key,
                              content_type: uploaded.content_type,
                              bytes: uploaded.bytes,
                              width: uploaded.width,
                              height: uploaded.height,
                            },
                          }
                        : option,
                    ),
                  }
                : entry,
            ),
          },
        };
      },
    });
  }

  function requireRoomHostOwner(session: RoomSession, actor: AuthenticatedAuthor) {
    if (session.room.host_binding.clerk_user_id !== actor.clerkUserId) {
      throw new AuthorizationError('Only the room owner can manage this host flow');
    }
  }

  function assertRoomStillReadable(session: RoomSession) {
    const currentTime = Date.parse(clock().toISOString());
    if (!isRoomStillReadable(session, currentTime)) {
      expireRoomIfReadabilityEnded(session, currentTime);
      throw new InvalidOperationError('Expired rooms are no longer readable');
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

  function currentEpochSeconds() {
    return Math.floor(clock().getTime() / 1000);
  }

  function createGuestBinding(session: RoomSession, player: RuntimeRoomPlayer, resumeToken: string): GuestBinding {
    return {
      roomId: session.room.room_id,
      roomCode: session.room.room_code,
      roomPlayerId: player.room_player_id,
      resumeToken,
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
        mutate: (current, now) => addQuestionToQuizDocument(current, now),
      });
    },

    async saveQuestion(input: SaveQuestionInput) {
      return saveUpdatedQuizDocument({
        actor: input.actor,
        quizId: input.quizId,
        mutate: (current, now) => saveQuestionInQuizDocument(current, now, input),
      });
    },

    async moveQuestion(input: { actor: AuthenticatedAuthor; quizId: string; questionId: string; direction: QuestionDirection }) {
      return saveUpdatedQuizDocument({
        actor: input.actor,
        quizId: input.quizId,
        mutate: (current, now) => moveQuestionInQuizDocument(current, now, input.questionId, input.direction),
      });
    },

    async deleteQuestion(input: { actor: AuthenticatedAuthor; quizId: string; questionId: string }) {
      return saveUpdatedQuizDocument({
        actor: input.actor,
        quizId: input.quizId,
        mutate: (current, now) => deleteQuestionFromQuizDocument(current, now, input.questionId),
      });
    },

    async addOption(input: { actor: AuthenticatedAuthor; quizId: string; questionId: string }) {
      return saveUpdatedQuizDocument({
        actor: input.actor,
        quizId: input.quizId,
        mutate: (current, now) => addOptionToQuizDocument(current, now, input.questionId),
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
        mutate: (current, now) =>
          moveOptionInQuizDocument(current, now, input.questionId, input.optionId, input.direction),
      });
    },

    async deleteOption(input: { actor: AuthenticatedAuthor; quizId: string; questionId: string; optionId: string }) {
      return saveUpdatedQuizDocument({
        actor: input.actor,
        quizId: input.quizId,
        mutate: (current, now) => deleteOptionFromQuizDocument(current, now, input.questionId, input.optionId),
      });
    },

    async uploadQuestionImage(input: { actor: AuthenticatedAuthor; quizId: string; questionId: string; file: File }) {
      return replaceQuestionImage(input);
    },

    async removeQuestionImage(input: { actor: AuthenticatedAuthor; quizId: string; questionId: string }) {
      await reclaimDeferredQuizImageObjects();
      const current = await authoringService.loadOwnedQuizDocument({ actor: input.actor, quizId: input.quizId });
      const currentQuestion = mustQuestionDocument(current, input.questionId);
      const nextDocument = {
        ...current,
        questions: current.questions.map((entry) =>
          entry.question.question_id === input.questionId
            ? {
                ...entry,
                question: {
                  ...entry.question,
                  image: undefined,
                },
              }
            : entry,
        ),
      };
      const saved = await authoringService.saveQuizDocument({
        actor: input.actor,
        document: nextDocument,
      });
      await reclaimStaleQuizImageObject({ quizId: input.quizId, document: saved, reference: currentQuestion.question.image });
      return saved;
    },

    async uploadOptionImage(input: {
      actor: AuthenticatedAuthor;
      quizId: string;
      questionId: string;
      optionId: string;
      file: File;
    }) {
      return replaceOptionImage(input);
    },

    async removeOptionImage(input: { actor: AuthenticatedAuthor; quizId: string; questionId: string; optionId: string }) {
      await reclaimDeferredQuizImageObjects();
      const current = await authoringService.loadOwnedQuizDocument({ actor: input.actor, quizId: input.quizId });
      const currentOption = mustOptionDocument(current, input.questionId, input.optionId);
      const nextDocument = {
        ...current,
        questions: current.questions.map((entry) =>
          entry.question.question_id === input.questionId
            ? {
                ...entry,
                options: entry.options.map((option) =>
                  option.option_id === input.optionId
                    ? {
                        ...option,
                        image: undefined,
                      }
                    : option,
                ),
              }
            : entry,
        ),
      };
      const saved = await authoringService.saveQuizDocument({
        actor: input.actor,
        document: nextDocument,
      });
      await reclaimStaleQuizImageObject({ quizId: input.quizId, document: saved, reference: currentOption.image });
      return saved;
    },

    async readAuthoringQuizImageAsset(input: { actor: AuthenticatedAuthor; quizId: string; objectKey: string }) {
      const current = await authoringService.loadOwnedQuizDocument({ actor: input.actor, quizId: input.quizId });
      const reference = findQuizImageReference(current, input.objectKey);
      if (!reference) {
        throw new NotFoundError(`Image asset ${input.objectKey} was not found`);
      }
      return readStoredQuizImageAsset(reference);
    },

    async readHostRuntimeQuizImageAsset(input: { actor: AuthenticatedAuthor; roomCode: string; objectKey: string }) {
      const session = mustRoomSession(input.roomCode);
      requireRoomHostOwner(session, input.actor);
      assertRoomStillReadable(session);
      const reference = findActiveQuestionImageReference(session, input.objectKey);
      if (!reference) {
        throw new NotFoundError(`Runtime image asset ${input.objectKey} was not found`);
      }
      return readStoredQuizImageAsset(reference);
    },

    async readPlayerRuntimeQuizImageAsset(input: { guestSessionId: string; roomCode: string; objectKey: string }) {
      const binding = getGuestBinding(input.guestSessionId, input.roomCode);
      if (!binding) {
        throw new AuthorizationError('Join the room before loading runtime quiz images');
      }
      const session = mustRoomSession(binding.roomCode);
      syncRoomLifecycle(session);
      assertRoomStillReadable(session);
      const player = resolvePlayerForBinding(session, binding);
      if (!player || binding.resumeVersion !== player.resume_version) {
        throw new AuthorizationError('Player session is no longer authorized for this room');
      }
      const reference = findActiveQuestionImageReference(session, input.objectKey);
      if (!reference) {
        throw new NotFoundError(`Runtime image asset ${input.objectKey} was not found`);
      }
      return readStoredQuizImageAsset(reference);
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

    joinRoom(input: { guestSessionId: string; roomCode: string; displayName: string }): PlayerSessionBinding {
      let session: RoomSession | null = null;
      let normalizedRoomCode = normalizeRoomCode(input.roomCode);

      try {
        const command = playerJoinCommandSchema.parse({ room_code: input.roomCode, display_name: input.displayName });
        normalizedRoomCode = normalizeRoomCode(command.room_code);
        const existingBinding = getGuestBinding(input.guestSessionId, normalizedRoomCode);
        if (existingBinding) {
          throw new InvalidOperationError('Room already joined in this guest session');
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

        const binding = createGuestBinding(session, joinedPlayer, resumeToken);
        setGuestBinding(input.guestSessionId, binding);
        logRuntimeEvent('runtime.player_join', {
          roomId: session.room.room_id,
          roomCode: normalizedRoomCode,
          roomPlayerId,
          lifecycleState: session.room.lifecycle_state,
          bindingReused: false,
        });
        return createPlayerSessionBinding(binding, resumeToken);
      } catch (error) {
        logRuntimeFailure('runtime.player_join.failed', error, {
          roomId: session?.room.room_id ?? null,
          roomCode: normalizedRoomCode,
        });
        throw error;
      }
    },

    reconnectPlayer(input: { guestSessionId: string; roomCode: string; roomId: string; roomPlayerId: string; resumeToken: string }): PlayerSessionBinding {
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
        const binding = createGuestBinding(session, reconnected.player, reconnected.resumeToken);
        setGuestBinding(input.guestSessionId, binding);
        logRuntimeEvent('runtime.player_reconnect', {
          roomId: session.room.room_id,
          roomCode: normalizedRoomCode,
          roomPlayerId: input.roomPlayerId,
          lifecycleState: session.room.lifecycle_state,
          questionPhase: session.questionState?.phase ?? null,
        });
        return createPlayerSessionBinding(binding, reconnected.resumeToken);
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
      syncRoomLifecycle(session);
      const player = resolvePlayerForBinding(session, binding);
      if (!player || binding.resumeVersion !== player.resume_version) {
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