import { describe, expect, test } from 'bun:test';
import {
  answerSelectionSchema,
  answerSubmissionCommandSchema,
  answerSubmissionRecordSchema,
  type AuthoringQuizDocument,
  authoringQuizDocumentSchema,
  createRoomResponseSchema,
  hostClaimCommandSchema,
  hostClaimTokenClaimsSchema,
  hostRoomStateSchema,
  playerJoinCommandSchema,
  playerReconnectCommandSchema,
  playerRoomStateSchema,
  runtimeQuestionOptionSnapshotSchema,
  runtimeQuestionSnapshotSchema,
  runtimeQuestionStateSchema,
  runtimeRoomPlayerSchema,
  runtimeRoomSchema,
} from '@/lib/shared/contracts';
import {
  answerSelectionFixture,
  answerSubmissionCommandFixture,
  answerSubmissionRecordFixture,
  createRoomResponseFixture,
  hostClaimCommandFixture,
  hostClaimTokenClaimsFixture,
  hostRoomStateFixture,
  playerJoinCommandFixture,
  playerReconnectCommandFixture,
  playerRoomStateFixture,
  publishedQuizDocumentFixture,
  runtimeQuestionOptionSnapshotFixture,
  runtimeQuestionSnapshotFixture,
  runtimeQuestionStateFixture,
  runtimeRoomFixture,
  runtimeRoomPlayerFixture,
} from '@/tests/fixtures/domain-contracts';

type ImageContractTestQuizDocument = Omit<AuthoringQuizDocument, 'questions'> & {
  questions: Array<{
    question: Omit<AuthoringQuizDocument['questions'][number]['question'], 'image'> & { image?: unknown };
    options: Array<Omit<AuthoringQuizDocument['questions'][number]['options'][number], 'image'> & { image?: unknown }>;
  }>;
};

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

function cloneQuizForImageContractTests(): ImageContractTestQuizDocument {
  return {
    quiz: { ...publishedQuizDocumentFixture.quiz },
    questions: publishedQuizDocumentFixture.questions.map(({ question, options }) => ({
      question: { ...question },
      options: options.map((option) => ({ ...option })),
    })),
  };
}

describe('shared domain contracts', () => {
  test('accepts a valid published authoring quiz document', () => {
    const result = authoringQuizDocumentSchema.safeParse(publishedQuizDocumentFixture);
    expect(result.success).toBe(true);
  });

  test('accepts optional Cloudflare R2 image references across authoring and runtime DTOs', () => {
    const questionImageInput = { ...questionImageFixture, data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]) };
    const optionImageInput = { ...optionImageFixture, data: Uint8Array.from([0x52, 0x32]) };
    const quizWithImages = cloneQuizForImageContractTests();

    quizWithImages.questions[0].question.image = questionImageInput;
    quizWithImages.questions[0].options[0].image = optionImageInput;
    quizWithImages.questions[1].question.image = null;

    const parsedDocument = authoringQuizDocumentSchema.safeParse(quizWithImages);

    expect(parsedDocument.success).toBe(true);
    if (parsedDocument.success) {
      expect(parsedDocument.data.questions[0].question.image).toEqual(questionImageFixture);
      expect(parsedDocument.data.questions[0].options[0].image).toEqual(optionImageFixture);
      expect(parsedDocument.data.questions[1].question.image).toBeUndefined();
      expect('data' in (parsedDocument.data.questions[0].question.image as Record<string, unknown>)).toBe(false);
      expect('data' in (parsedDocument.data.questions[0].options[0].image as Record<string, unknown>)).toBe(false);
    }

    expect(
      runtimeQuestionSnapshotSchema.parse({
        ...runtimeQuestionSnapshotFixture,
        image: questionImageInput,
      }).image,
    ).toEqual(questionImageFixture);
    expect(
      runtimeQuestionOptionSnapshotSchema.parse({
        ...runtimeQuestionOptionSnapshotFixture,
        image: optionImageInput,
      }).image,
    ).toEqual(optionImageFixture);
    expect(
      playerRoomStateSchema.parse({
        ...playerRoomStateFixture,
        active_question: {
          ...playerRoomStateFixture.active_question,
          image: questionImageInput,
          display_options: playerRoomStateFixture.active_question!.display_options.map((option) =>
            option.option_id === 'option-1' ? { ...option, image: optionImageInput } : option,
          ),
        },
      }).active_question?.image,
    ).toEqual(questionImageFixture);
    expect(
      hostRoomStateSchema.parse({
        ...hostRoomStateFixture,
        active_question: {
          ...hostRoomStateFixture.active_question,
          image: questionImageInput,
          display_options: hostRoomStateFixture.active_question!.display_options.map((option) =>
            option.option_id === 'option-1' ? { ...option, image: optionImageInput } : option,
          ),
        },
      }).active_question?.display_options.find((option) => option.option_id === 'option-1')?.image,
    ).toEqual(optionImageFixture);
  });

  test('rejects a published quiz with no questions', () => {
    const result = authoringQuizDocumentSchema.safeParse({
      ...publishedQuizDocumentFixture,
      questions: [],
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid single-choice correctness rules', () => {
    const result = authoringQuizDocumentSchema.safeParse({
      ...publishedQuizDocumentFixture,
      questions: [
        {
          ...publishedQuizDocumentFixture.questions[0],
          options: publishedQuizDocumentFixture.questions[0].options.map((option) => ({
            ...option,
            is_correct: true,
          })),
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid multiple-choice option composition', () => {
    const invalid = structuredClone(publishedQuizDocumentFixture) as unknown as AuthoringQuizDocument;
    invalid.questions[1].options = [
      { option_id: 'option-3', question_id: 'question-2', position: 1, text: '2', is_correct: true },
      { option_id: 'option-4', question_id: 'question-2', position: 2, text: '4', is_correct: false },
      { option_id: 'option-5', question_id: 'question-2', position: 3, text: '6', is_correct: false },
    ];

    const result = authoringQuizDocumentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test('rejects invalid image metadata on authoring quiz records', () => {
    const invalid = cloneQuizForImageContractTests();

    invalid.questions[0].question.image = {
      ...questionImageFixture,
      content_type: 'image/gif',
    };

    const result = authoringQuizDocumentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test('rejects duplicate authoring positions for questions and options', () => {
    const invalid = structuredClone(publishedQuizDocumentFixture) as unknown as AuthoringQuizDocument;
    invalid.questions[1].question.position = invalid.questions[0].question.position;
    invalid.questions[0].options[1].position = invalid.questions[0].options[0].position;

    expect(authoringQuizDocumentSchema.safeParse(invalid).success).toBe(false);
  });

  test('accepts create-room bootstrap and host claim claims fixtures', () => {
    expect(createRoomResponseSchema.safeParse(createRoomResponseFixture).success).toBe(true);
    expect(hostClaimCommandSchema.safeParse(hostClaimCommandFixture).success).toBe(true);
    expect(hostClaimTokenClaimsSchema.safeParse(hostClaimTokenClaimsFixture).success).toBe(true);
  });

  test('rejects host claim payloads that exceed the MVP ttl', () => {
    const result = hostClaimTokenClaimsSchema.safeParse({
      ...hostClaimTokenClaimsFixture,
      exp: hostClaimTokenClaimsFixture.iat + 61,
    });
    expect(result.success).toBe(false);
  });

  test('accepts player join/reconnect commands and rejects duplicate answer selections', () => {
    expect(playerJoinCommandSchema.safeParse(playerJoinCommandFixture).success).toBe(true);
    expect(playerReconnectCommandSchema.safeParse(playerReconnectCommandFixture).success).toBe(true);

    const duplicateResult = answerSubmissionCommandSchema.safeParse({
      ...answerSubmissionCommandFixture,
      selected_option_ids: ['option-1', 'option-1'],
    });

    expect(duplicateResult.success).toBe(false);
  });

  test('accepts runtime room, snapshot, and state records', () => {
    expect(runtimeRoomSchema.safeParse(runtimeRoomFixture).success).toBe(true);
    expect(runtimeRoomPlayerSchema.safeParse(runtimeRoomPlayerFixture).success).toBe(true);
    expect(runtimeQuestionSnapshotSchema.safeParse(runtimeQuestionSnapshotFixture).success).toBe(true);
    expect(runtimeQuestionOptionSnapshotSchema.safeParse(runtimeQuestionOptionSnapshotFixture).success).toBe(true);
    expect(runtimeQuestionStateSchema.safeParse(runtimeQuestionStateFixture).success).toBe(true);
    expect(answerSubmissionRecordSchema.safeParse(answerSubmissionRecordFixture).success).toBe(true);
    expect(answerSelectionSchema.safeParse(answerSelectionFixture).success).toBe(true);
  });

  test('keeps role-specific runtime state DTOs constrained by phase', () => {
    expect(playerRoomStateSchema.safeParse(playerRoomStateFixture).success).toBe(true);
    expect(hostRoomStateSchema.safeParse(hostRoomStateFixture).success).toBe(true);

    const invalidPlayerState = {
      ...playerRoomStateFixture,
      shared_room: {
        ...playerRoomStateFixture.shared_room,
        question_phase: 'question_open',
      },
      leaderboard: [{ room_player_id: 'player-1', display_name: 'Player One', score_total: 100, correct_count: 1, rank: 1 }],
    };

    expect(playerRoomStateSchema.safeParse(invalidPlayerState).success).toBe(false);
  });
});