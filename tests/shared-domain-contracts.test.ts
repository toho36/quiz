/// <reference types="bun-types" />

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

describe('shared domain contracts', () => {
  test('accepts a valid published authoring quiz document', () => {
    const result = authoringQuizDocumentSchema.safeParse(publishedQuizDocumentFixture);
    expect(result.success).toBe(true);
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