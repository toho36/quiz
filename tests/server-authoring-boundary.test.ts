import { describe, expect, test } from 'bun:test';
import { createAuthoringService } from '@/lib/server/authoring-service';
import { createRoomBootstrapService } from '@/lib/server/room-bootstrap-service';
import { AuthorizationError, InvalidOperationError } from '@/lib/server/service-errors';
import { publishedQuizDocumentFixture } from '@/tests/fixtures/domain-contracts';

const questionImageFixture = {
  storage_provider: 'cloudflare_r2',
  object_key: 'quiz-images/quiz-1/question-1/image.png',
  content_type: 'image/png',
  bytes: 256_000,
  width: 1200,
  height: 800,
} as const;

const optionImageFixture = {
  ...questionImageFixture,
  object_key: 'quiz-images/quiz-1/question-1/option-1.webp',
  content_type: 'image/webp',
  bytes: 128_000,
  width: 640,
  height: 640,
} as const;

describe('server-side authoring boundary', () => {
  test('rejects ownership mismatches before returning quiz data', async () => {
    const service = createAuthoringService({
      quizStore: {
        async getQuizDocument() {
          return publishedQuizDocumentFixture;
        },
        async saveQuizDocument(document) {
          return document;
        },
      },
    });

    await expect(
      service.loadOwnedQuizDocument({
        actor: { clerkUserId: 'user-2' },
        quizId: 'quiz-1',
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test('preserves server-owned quiz metadata on authoring saves', async () => {
    let savedDocument: unknown;
    const questionImageInput = { ...questionImageFixture, data: Uint8Array.from([0x01, 0x02, 0x03]) };
    const optionImageInput = { ...optionImageFixture, data: Uint8Array.from([0x04, 0x05]) };
    const service = createAuthoringService({
      clock: () => new Date('2026-03-06T12:30:00.000Z'),
      quizStore: {
        async getQuizDocument() {
          return publishedQuizDocumentFixture;
        },
        async saveQuizDocument(document) {
          savedDocument = document;
          return document;
        },
      },
    });

    const result = await service.saveQuizDocument({
      actor: { clerkUserId: 'user-1' },
      document: {
        ...publishedQuizDocumentFixture,
        quiz: {
          ...publishedQuizDocumentFixture.quiz,
          owner_user_id: 'user-999',
          status: 'draft',
          title: 'Updated title',
          updated_at: '2020-01-01T00:00:00.000Z',
          published_at: undefined,
        },
        questions: publishedQuizDocumentFixture.questions.map((entry, index) =>
          index === 0
            ? {
                ...entry,
                question: {
                  ...entry.question,
                  image: questionImageInput,
                },
                options: entry.options.map((option) =>
                  option.option_id === 'option-1' ? { ...option, image: optionImageInput } : option,
                ),
              }
            : entry,
        ),
      },
    });

    expect(result.quiz.owner_user_id).toBe('user-1');
    expect(result.quiz.status).toBe('published');
    expect(result.quiz.title).toBe('Updated title');
    expect(result.quiz.updated_at).toBe('2026-03-06T12:30:00.000Z');
    expect(result.quiz.published_at).toBe(publishedQuizDocumentFixture.quiz.published_at);
    expect(result.questions[0].question.image).toEqual(questionImageFixture);
    expect(result.questions[0].options[0].image).toEqual(optionImageFixture);
    expect('data' in (result.questions[0].question.image as Record<string, unknown>)).toBe(false);
    expect('data' in (result.questions[0].options[0].image as Record<string, unknown>)).toBe(false);
    expect(savedDocument).toEqual(result);
  });

  test('rejects invalid image metadata at the authoring save boundary', async () => {
    const service = createAuthoringService({
      quizStore: {
        async getQuizDocument() {
          return publishedQuizDocumentFixture;
        },
        async saveQuizDocument(document) {
          return document;
        },
      },
    });

    await expect(
      service.saveQuizDocument({
        actor: { clerkUserId: 'user-1' },
        document: {
          ...publishedQuizDocumentFixture,
          questions: publishedQuizDocumentFixture.questions.map((entry, index) =>
            index === 0
              ? {
                  ...entry,
                  question: {
                    ...entry.question,
                    image: {
                      ...questionImageFixture,
                      content_type: 'image/gif',
                    },
                  },
                }
              : entry,
          ),
        },
      }),
    ).rejects.toThrow('question.image.content_type');
  });

  test('publishes through the shared quiz document validator', async () => {
    const invalidDraft = {
      ...publishedQuizDocumentFixture,
      quiz: {
        ...publishedQuizDocumentFixture.quiz,
        status: 'draft',
        published_at: undefined,
      },
      questions: [],
    };

    const service = createAuthoringService({
      clock: () => new Date('2026-03-06T12:31:00.000Z'),
      quizStore: {
        async getQuizDocument() {
          return invalidDraft;
        },
        async saveQuizDocument(document) {
          return document;
        },
      },
    });

    await expect(
      service.publishQuiz({
        actor: { clerkUserId: 'user-1' },
        quizId: 'quiz-1',
      }),
    ).rejects.toThrow('Published quizzes must contain 1 to 50 questions');
  });
});

describe('room bootstrap boundary', () => {
  test('creates a room only for an owned published quiz and returns a shared contract response', async () => {
    const authoringService = createAuthoringService({
      quizStore: {
        async getQuizDocument() {
          return publishedQuizDocumentFixture;
        },
        async saveQuizDocument(document) {
          return document;
        },
      },
    });

    const roomCalls: Array<{ sourceQuizId: string; ownerUserId: string }> = [];
    const signedClaims: string[] = [];
    const service = createRoomBootstrapService({
      authoringService,
      clock: () => new Date('2026-03-06T13:00:00.000Z'),
      generateJti: () => 'claim-123',
      roomProvisioner: {
        async createRoom(input) {
          roomCalls.push({ sourceQuizId: input.sourceQuizId, ownerUserId: input.ownerUserId });
          expect(input.roomPolicy).toEqual({
            scoring_mode: 'speed_weighted',
            question_time_limit_seconds: 30,
            shuffle_answers: true,
            late_join_allowed: false,
          });

          return { room_id: 'room-1', room_code: 'ABCD12' };
        },
      },
      hostClaimSigner: {
        async signHostClaim(claims) {
          signedClaims.push(JSON.stringify(claims));
          return 'signed-host-claim';
        },
      },
    });

    const result = await service.createRoom({
      actor: { clerkUserId: 'user-1', clerkSessionId: 'session-1' },
      quizId: 'quiz-1',
    });

    expect(roomCalls).toEqual([{ sourceQuizId: 'quiz-1', ownerUserId: 'user-1' }]);
    expect(result).toEqual({
      room_id: 'room-1',
      room_code: 'ABCD12',
      source_quiz_id: 'quiz-1',
      room_policy: {
        scoring_mode: 'speed_weighted',
        question_time_limit_seconds: 30,
        shuffle_answers: true,
        late_join_allowed: false,
      },
      host_claim_token: 'signed-host-claim',
      host_claim_expires_at: '2026-03-06T13:01:00.000Z',
    });
    expect(signedClaims).toEqual([
      JSON.stringify({
        purpose: 'host_claim',
        room_id: 'room-1',
        clerk_user_id: 'user-1',
        clerk_session_id: 'session-1',
        jti: 'claim-123',
        iat: 1772802000,
        exp: 1772802060,
        v: 1,
      }),
    ]);
  });

  test('rejects room bootstrap for unpublished quizzes', async () => {
    const service = createRoomBootstrapService({
      authoringService: createAuthoringService({
        quizStore: {
          async getQuizDocument() {
            return {
              ...publishedQuizDocumentFixture,
              quiz: {
                ...publishedQuizDocumentFixture.quiz,
                status: 'draft',
                published_at: undefined,
              },
            };
          },
          async saveQuizDocument(document) {
            return document;
          },
        },
      }),
      roomProvisioner: {
        async createRoom() {
          return { room_id: 'room-1', room_code: 'ABCD12' };
        },
      },
      hostClaimSigner: {
        async signHostClaim() {
          return 'signed-host-claim';
        },
      },
    });

    await expect(
      service.createRoom({
        actor: { clerkUserId: 'user-1', clerkSessionId: 'session-1' },
        quizId: 'quiz-1',
      }),
    ).rejects.toBeInstanceOf(InvalidOperationError);
  });

  test('requires a verified session before issuing a host claim', async () => {
    const service = createRoomBootstrapService({
      authoringService: createAuthoringService({
        quizStore: {
          async getQuizDocument() {
            return publishedQuizDocumentFixture;
          },
          async saveQuizDocument(document) {
            return document;
          },
        },
      }),
      roomProvisioner: {
        async createRoom() {
          return { room_id: 'room-1', room_code: 'ABCD12' };
        },
      },
      hostClaimSigner: {
        async signHostClaim() {
          return 'signed-host-claim';
        },
      },
    });

    await expect(
      service.createRoom({
        actor: { clerkUserId: 'user-1' },
        quizId: 'quiz-1',
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});