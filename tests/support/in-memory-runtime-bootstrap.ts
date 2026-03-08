/// <reference types="bun-types" />

import type { RuntimeBootstrapProvisioner } from '@/lib/server/runtime-spacetimedb-bootstrap';
import { createDemoSeedQuizDocuments } from '@/lib/server/demo-seed';
import {
  authoringQuizDocumentSchema,
  runtimeQuestionOptionSnapshotSchema,
  runtimeQuestionSnapshotSchema,
  runtimeRoomSchema,
  type AuthoringQuizDocument,
} from '@/lib/shared/contracts';

type InMemoryRuntimeBootstrapProvisionerOptions = {
  clock?: () => Date;
};

export function createInMemoryRuntimeBootstrapProvisioner(
  documents: AuthoringQuizDocument[] = createDemoSeedQuizDocuments(),
  { clock = () => new Date('2026-03-06T12:00:00.000Z') }: InMemoryRuntimeBootstrapProvisionerOptions = {},
): RuntimeBootstrapProvisioner {
  const storedDocuments = new Map(documents.map((document) => {
    const parsed = cloneDocument(document);
    return [parsed.quiz.quiz_id, parsed] as const;
  }));
  let nextRoomNumber = 1;

  return {
    async createRoom({ sourceQuizId, ownerUserId, roomPolicy }) {
      const document = storedDocuments.get(sourceQuizId);
      if (!document) {
        throw new Error(`Quiz ${sourceQuizId} was not found`);
      }

      const roomId = `room-${nextRoomNumber}`;
      const roomCode = `ROOM${String(nextRoomNumber).padStart(2, '0')}`;
      nextRoomNumber += 1;
      const createdAt = clock().toISOString();

      const room = runtimeRoomSchema.parse({
        room_id: roomId,
        room_code: roomCode,
        source_quiz_id: sourceQuizId,
        lifecycle_state: 'lobby',
        current_question_index: null,
        host_binding: { clerk_user_id: ownerUserId, host_binding_version: 1 },
        created_at: createdAt,
        started_at: null,
        ended_at: null,
        expires_at: new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1000).toISOString(),
        room_policy: roomPolicy,
      });

      const questionSnapshots = document.questions
        .slice()
        .sort((left, right) => left.question.position - right.question.position)
        .map((entry, questionIndex) =>
          runtimeQuestionSnapshotSchema.parse({
            room_id: roomId,
            question_index: questionIndex,
            source_question_id: entry.question.question_id,
            prompt: entry.question.prompt,
            image: entry.question.image,
            question_type: entry.question.question_type,
            evaluation_policy: entry.question.evaluation_policy,
            base_points: entry.question.base_points,
            effective_time_limit_seconds: entry.question.time_limit_seconds ?? document.quiz.default_question_time_limit_seconds,
            shuffle_answers: entry.question.shuffle_answers ?? document.quiz.shuffle_answers_default,
          }),
        );

      const optionSnapshots = document.questions
        .slice()
        .sort((left, right) => left.question.position - right.question.position)
        .flatMap((entry, questionIndex) => {
          const shouldShuffle = entry.question.shuffle_answers ?? document.quiz.shuffle_answers_default;
          const orderedOptions = entry.options.slice().sort((left, right) => left.position - right.position);
          const displayPositions = shouldShuffle
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
              image: option.image,
              is_correct: option.is_correct,
            }),
          );
        });

      return { room, questionSnapshots, optionSnapshots };
    },
  };
}

function cloneDocument(document: AuthoringQuizDocument) {
  return structuredClone(authoringQuizDocumentSchema.parse(document));
}