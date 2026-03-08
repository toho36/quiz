/// <reference types="bun-types" />

import type {
  AuthoringQuizSummary,
  AuthoringSpacetimeClient,
  AuthoringSpacetimeClientFactory,
} from '@/lib/server/authoring-spacetimedb-store';
import {
  authoringQuizDocumentSchema,
  type AuthoringQuizDocument,
} from '@/lib/shared/contracts';
import type { SpacetimeAuthoringQuizDocument } from '@/lib/server/authoring-spacetimedb-types';

export function createInMemoryAuthoringSpacetimeClientFactory(
  initialDocuments: AuthoringQuizDocument[] = [],
): AuthoringSpacetimeClientFactory {
  const storedDocuments = new Map(initialDocuments.map((document) => {
    const parsed = cloneDocument(document);
    return [parsed.quiz.quiz_id, parsed] as const;
  }));

  return async (): Promise<AuthoringSpacetimeClient> => ({
    procedures: {
      async listQuizSummaries({ owner_user_id }) {
        return [...storedDocuments.values()]
          .filter((document) => document.quiz.owner_user_id === owner_user_id)
          .sort((left, right) => right.quiz.updated_at.localeCompare(left.quiz.updated_at))
          .map((document): AuthoringQuizSummary => ({
            quiz_id: document.quiz.quiz_id,
            title: document.quiz.title,
            status: document.quiz.status,
            question_count: document.questions.length,
            updated_at: document.quiz.updated_at,
          }));
      },
      async loadQuizDocument({ quiz_id }) {
        const document = storedDocuments.get(quiz_id);
        return document ? toClientDocument(document) : undefined;
      },
      async saveQuizDocument({ document }) {
        const parsed = cloneDocument(document);
        storedDocuments.set(parsed.quiz.quiz_id, parsed);
        return toClientDocument(parsed);
      },
      async seedDemoDocuments({ documents }) {
        if (storedDocuments.size > 0) {
          return 0;
        }

        for (const document of documents) {
          const parsed = cloneDocument(document);
          storedDocuments.set(parsed.quiz.quiz_id, parsed);
        }

        return documents.length;
      },
    },
    disconnect() {},
  });
}

function cloneDocument(document: AuthoringQuizDocument | SpacetimeAuthoringQuizDocument) {
  return structuredClone(authoringQuizDocumentSchema.parse(document));
}

function toClientDocument(document: AuthoringQuizDocument): SpacetimeAuthoringQuizDocument {
  const parsed = cloneDocument(document);
  return {
    quiz: {
      ...parsed.quiz,
      published_at: parsed.quiz.published_at,
    },
    questions: parsed.questions.map((entry) => ({
      question: {
        ...entry.question,
        time_limit_seconds: entry.question.time_limit_seconds,
        shuffle_answers: entry.question.shuffle_answers,
      },
      options: entry.options.map((option) => ({ ...option })),
    })),
  };
}