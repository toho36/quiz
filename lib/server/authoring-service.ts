import { authoringQuizDocumentSchema, type AuthoringQuizDocument } from '@/lib/shared/contracts';
import { AuthorizationError, InvalidOperationError, NotFoundError } from '@/lib/server/service-errors';

export type AuthenticatedAuthor = {
  clerkUserId: string;
  clerkSessionId?: string;
};

export type AuthoringQuizStore = {
  getQuizDocument(quizId: string): Promise<unknown | null>;
  saveQuizDocument(document: AuthoringQuizDocument): Promise<unknown>;
};

type AuthoringServiceDependencies = {
  quizStore: AuthoringQuizStore;
  clock?: () => Date;
};

type LoadOwnedQuizInput = {
  actor: AuthenticatedAuthor;
  quizId: string;
};

type SaveQuizDocumentInput = {
  actor: AuthenticatedAuthor;
  document: unknown;
};

function parseQuizDocument(input: unknown) {
  return authoringQuizDocumentSchema.parse(input);
}

function assertQuizOwnership(document: AuthoringQuizDocument, actor: AuthenticatedAuthor) {
  if (document.quiz.owner_user_id !== actor.clerkUserId) {
    throw new AuthorizationError('Quiz ownership is enforced on the server');
  }
}

export function createAuthoringService({ quizStore, clock = () => new Date() }: AuthoringServiceDependencies) {
  async function loadOwnedQuizDocument({ actor, quizId }: LoadOwnedQuizInput) {
    const stored = await quizStore.getQuizDocument(quizId);

    if (!stored) {
      throw new NotFoundError(`Quiz ${quizId} was not found`);
    }

    const document = parseQuizDocument(stored);
    assertQuizOwnership(document, actor);
    return document;
  }

  async function saveQuizDocument({ actor, document }: SaveQuizDocumentInput) {
    const parsed = parseQuizDocument(document);
    const existing = await quizStore.getQuizDocument(parsed.quiz.quiz_id);
    const now = clock().toISOString();

    const nextDocument = existing
      ? buildUpdatedQuizDocument(parseQuizDocument(existing), parsed, now, actor)
      : buildNewQuizDocument(parsed, now, actor);

    const saved = await quizStore.saveQuizDocument(nextDocument);
    return parseQuizDocument(saved);
  }

  async function publishQuiz({ actor, quizId }: LoadOwnedQuizInput) {
    const current = await loadOwnedQuizDocument({ actor, quizId });

    if (current.quiz.status === 'archived') {
      throw new InvalidOperationError('Archived quizzes cannot be republished in the MVP boundary');
    }

    const now = clock().toISOString();
    const published = parseQuizDocument({
      ...current,
      quiz: {
        ...current.quiz,
        status: 'published',
        updated_at: now,
        published_at: current.quiz.published_at ?? now,
      },
    });

    const saved = await quizStore.saveQuizDocument(published);
    return parseQuizDocument(saved);
  }

  return {
    loadOwnedQuizDocument,
    saveQuizDocument,
    publishQuiz,
  };
}

function buildNewQuizDocument(document: AuthoringQuizDocument, now: string, actor: AuthenticatedAuthor) {
  if (document.quiz.status !== 'draft') {
    throw new InvalidOperationError('New quizzes must start as drafts and use the explicit publish flow');
  }

  return parseQuizDocument({
    ...document,
    quiz: {
      ...document.quiz,
      owner_user_id: actor.clerkUserId,
      status: 'draft',
      created_at: now,
      updated_at: now,
      published_at: undefined,
    },
  });
}

function buildUpdatedQuizDocument(
  existing: AuthoringQuizDocument,
  next: AuthoringQuizDocument,
  now: string,
  actor: AuthenticatedAuthor,
) {
  assertQuizOwnership(existing, actor);

  return parseQuizDocument({
    ...next,
    quiz: {
      ...next.quiz,
      owner_user_id: existing.quiz.owner_user_id,
      status: existing.quiz.status,
      created_at: existing.quiz.created_at,
      updated_at: now,
      published_at: existing.quiz.published_at,
    },
  });
}

export type AuthoringService = ReturnType<typeof createAuthoringService>;