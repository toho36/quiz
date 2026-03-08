import { schema, table, t, type InferSchema, type TransactionCtx } from 'spacetimedb/server';
import { authoringQuizDocumentSchema, type AuthoringQuizDocument } from '../lib/shared/contracts';
import {
  authoringQuizDocumentType,
  authoringQuizSummaryType,
  type SpacetimeAuthoringQuizDocument,
  type SpacetimeAuthoringQuizSummary,
} from '../lib/server/authoring-spacetimedb-types';
import {
  runtimeBootstrapPayloadType,
  type SpacetimeRuntimeBootstrapPayload,
} from '../lib/server/runtime-spacetimedb-types';

type StoredQuizRow = {
  quiz_id: string;
  owner_user_id: string;
  title: string;
  description: string;
  status: string;
  default_scoring_mode: string;
  default_question_time_limit_seconds: number;
  shuffle_answers_default: boolean;
  question_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | undefined;
};

type StoredQuestionRow = {
  question_id: string;
  quiz_id: string;
  position: number;
  prompt: string;
  question_type: string;
  evaluation_policy: string;
  base_points: number;
  time_limit_seconds: number | undefined;
  shuffle_answers: boolean | undefined;
  created_at: string;
  updated_at: string;
};

type StoredQuestionOptionRow = {
  option_id: string;
  question_id: string;
  position: number;
  text: string;
  is_correct: boolean;
};

type StoredRuntimeRoomRow = {
  room_id: string;
  room_code: string;
  source_quiz_id: string;
  lifecycle_state: string;
  current_question_index: number | undefined;
  host_clerk_user_id: string;
  host_binding_version: number;
  created_at: string;
  started_at: string | undefined;
  ended_at: string | undefined;
  expires_at: string;
  scoring_mode: string;
  question_time_limit_seconds: number;
  shuffle_answers: boolean;
  late_join_allowed: boolean;
};

type StoredRuntimeQuestionSnapshotRow = {
  snapshot_id: string;
  room_id: string;
  question_index: number;
  source_question_id: string;
  prompt: string;
  question_type: string;
  evaluation_policy: string;
  base_points: number;
  effective_time_limit_seconds: number | undefined;
  shuffle_answers: boolean;
};

type StoredRuntimeQuestionOptionSnapshotRow = {
  snapshot_id: string;
  room_id: string;
  question_index: number;
  source_option_id: string;
  author_position: number;
  display_position: number;
  text: string;
  is_correct: boolean;
};

const quizzes = table(
  { name: 'authoring_quiz' },
  {
    quiz_id: t.string().primaryKey(),
    owner_user_id: t.string().index('btree'),
    title: t.string(),
    description: t.string(),
    status: t.string(),
    default_scoring_mode: t.string(),
    default_question_time_limit_seconds: t.u32(),
    shuffle_answers_default: t.bool(),
    question_count: t.u32(),
    created_at: t.string(),
    updated_at: t.string(),
    published_at: t.option(t.string()),
  },
);

const questions = table(
  { name: 'authoring_question' },
  {
    question_id: t.string().primaryKey(),
    quiz_id: t.string().index('btree'),
    position: t.u32(),
    prompt: t.string(),
    question_type: t.string(),
    evaluation_policy: t.string(),
    base_points: t.u32(),
    time_limit_seconds: t.option(t.u32()),
    shuffle_answers: t.option(t.bool()),
    created_at: t.string(),
    updated_at: t.string(),
  },
);

const questionOptions = table(
  { name: 'authoring_question_option' },
  {
    option_id: t.string().primaryKey(),
    question_id: t.string().index('btree'),
    position: t.u32(),
    text: t.string(),
    is_correct: t.bool(),
  },
);

const runtimeRooms = table(
  { name: 'runtime_room' },
  {
    room_id: t.string().primaryKey(),
    room_code: t.string().unique(),
    source_quiz_id: t.string().index('btree'),
    lifecycle_state: t.string(),
    current_question_index: t.option(t.u32()),
    host_clerk_user_id: t.string().index('btree'),
    host_binding_version: t.u32(),
    created_at: t.string(),
    started_at: t.option(t.string()),
    ended_at: t.option(t.string()),
    expires_at: t.string(),
    scoring_mode: t.string(),
    question_time_limit_seconds: t.u32(),
    shuffle_answers: t.bool(),
    late_join_allowed: t.bool(),
  },
);

const runtimeQuestionSnapshots = table(
  { name: 'runtime_question_snapshot' },
  {
    snapshot_id: t.string().primaryKey(),
    room_id: t.string().index('btree'),
    question_index: t.u32(),
    source_question_id: t.string(),
    prompt: t.string(),
    question_type: t.string(),
    evaluation_policy: t.string(),
    base_points: t.u32(),
    effective_time_limit_seconds: t.option(t.u32()),
    shuffle_answers: t.bool(),
  },
);

const runtimeQuestionOptionSnapshots = table(
  { name: 'runtime_question_option_snapshot' },
  {
    snapshot_id: t.string().primaryKey(),
    room_id: t.string().index('btree'),
    question_index: t.u32(),
    source_option_id: t.string(),
    author_position: t.u32(),
    display_position: t.u32(),
    text: t.string(),
    is_correct: t.bool(),
  },
);

const quizModule = schema({
  quizzes,
  questions,
  questionOptions,
  runtimeRooms,
  runtimeQuestionSnapshots,
  runtimeQuestionOptionSnapshots,
});
type QuizTransaction = TransactionCtx<InferSchema<typeof quizModule>>;

export const listQuizSummaries = quizModule.procedure(
  { name: 'list_quiz_summaries' },
  { owner_user_id: t.string() },
  t.array(authoringQuizSummaryType),
  (ctx, { owner_user_id }): SpacetimeAuthoringQuizSummary[] =>
    ctx.withTx((tx) =>
      (Array.from(tx.db.quizzes.owner_user_id.filter(owner_user_id)) as StoredQuizRow[])
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .map((quiz) => ({
          quiz_id: quiz.quiz_id,
          title: quiz.title,
          status: quiz.status,
          question_count: quiz.question_count,
          updated_at: quiz.updated_at,
        })),
    ),
);

export const loadQuizDocument = quizModule.procedure(
  { name: 'load_quiz_document' },
  { quiz_id: t.string() },
  t.option(authoringQuizDocumentType),
  (ctx, { quiz_id }): SpacetimeAuthoringQuizDocument | undefined => ctx.withTx((tx) => loadStoredDocument(tx, quiz_id)),
);

export const saveQuizDocument = quizModule.procedure(
  { name: 'save_quiz_document' },
  { document: authoringQuizDocumentType },
  authoringQuizDocumentType,
  (ctx, { document }): SpacetimeAuthoringQuizDocument =>
    ctx.withTx((tx) => {
      const parsed = parseDocument(document);
      persistDocument(tx, parsed);
      return toSpacetimeQuizDocument(parsed);
    }),
);

export const bootstrapRoom = quizModule.procedure(
  { name: 'bootstrap_room' },
  { source_quiz_id: t.string(), owner_user_id: t.string() },
  runtimeBootstrapPayloadType,
  (ctx, { source_quiz_id, owner_user_id }): SpacetimeRuntimeBootstrapPayload =>
    ctx.withTx((tx) => {
      const quiz = tx.db.quizzes.quiz_id.find(source_quiz_id) as StoredQuizRow | null;
      if (!quiz) {
        throw new Error(`Quiz ${source_quiz_id} was not found`);
      }
      if (quiz.owner_user_id !== owner_user_id) {
        throw new Error(`Quiz ${source_quiz_id} is not owned by ${owner_user_id}`);
      }
      if (quiz.status !== 'published') {
        throw new Error(`Quiz ${source_quiz_id} must be published before bootstrapping a room`);
      }

      const roomId = ctx.newUuidV7().toString();
      const roomCode = createUniqueRoomCode(tx, ctx.random);
      const createdAt = ctx.timestamp.toDate().toISOString();
      const expiresAt = new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1000).toISOString();
      const roomPolicy = createRuntimeRoomPolicy(quiz);
      const room: StoredRuntimeRoomRow = {
        room_id: roomId,
        room_code: roomCode,
        source_quiz_id,
        lifecycle_state: 'lobby',
        current_question_index: undefined,
        host_clerk_user_id: owner_user_id,
        host_binding_version: 1,
        created_at: createdAt,
        started_at: undefined,
        ended_at: undefined,
        expires_at: expiresAt,
        scoring_mode: roomPolicy.scoring_mode,
        question_time_limit_seconds: roomPolicy.question_time_limit_seconds,
        shuffle_answers: roomPolicy.shuffle_answers,
        late_join_allowed: roomPolicy.late_join_allowed,
      };

      tx.db.runtimeRooms.insert(room);

      const questionSnapshots = buildRuntimeQuestionSnapshots(tx, quiz, roomId);
      for (const snapshot of questionSnapshots) {
        tx.db.runtimeQuestionSnapshots.insert(snapshot);
      }

      const optionSnapshots = buildRuntimeQuestionOptionSnapshots(tx, quiz, roomId, questionSnapshots);
      for (const snapshot of optionSnapshots) {
        tx.db.runtimeQuestionOptionSnapshots.insert(snapshot);
      }

      return toRuntimeBootstrapPayload(room, questionSnapshots, optionSnapshots);
    }),
);

export const seedDemoDocuments = quizModule.procedure(
  { name: 'seed_demo_documents' },
  { documents: t.array(authoringQuizDocumentType) },
  t.u32(),
  (ctx, { documents }) =>
    ctx.withTx((tx) => {
      if (Number(tx.db.quizzes.count()) > 0) {
        return 0;
      }

      for (const document of documents) {
        persistDocument(tx, parseDocument(document));
      }

      return documents.length;
    }),
);

export default quizModule;

function parseDocument(document: unknown): AuthoringQuizDocument {
  return authoringQuizDocumentSchema.parse(document);
}

function loadStoredDocument(tx: QuizTransaction, quizId: string): SpacetimeAuthoringQuizDocument | undefined {
  const quiz = tx.db.quizzes.quiz_id.find(quizId) as StoredQuizRow | null;
  if (!quiz) {
    return undefined;
  }

  const questionsForQuiz = (Array.from(tx.db.questions.quiz_id.filter(quizId)) as StoredQuestionRow[]).sort(
    (left, right) => left.position - right.position,
  );
  return toSpacetimeQuizDocument(parseDocument({
    quiz: {
      quiz_id: quiz.quiz_id,
      owner_user_id: quiz.owner_user_id,
      title: quiz.title,
      description: quiz.description,
      status: quiz.status,
      default_scoring_mode: quiz.default_scoring_mode,
      default_question_time_limit_seconds: quiz.default_question_time_limit_seconds,
      shuffle_answers_default: quiz.shuffle_answers_default,
      created_at: quiz.created_at,
      updated_at: quiz.updated_at,
      published_at: quiz.published_at,
    },
    questions: questionsForQuiz.map((question) => ({
      question: {
        question_id: question.question_id,
        quiz_id: question.quiz_id,
        position: question.position,
        prompt: question.prompt,
        question_type: question.question_type,
        evaluation_policy: question.evaluation_policy,
        base_points: question.base_points,
        time_limit_seconds: question.time_limit_seconds,
        shuffle_answers: question.shuffle_answers,
        created_at: question.created_at,
        updated_at: question.updated_at,
      },
      options: (Array.from(tx.db.questionOptions.question_id.filter(question.question_id)) as StoredQuestionOptionRow[])
        .sort((left, right) => left.position - right.position)
        .map((option) => ({
          option_id: option.option_id,
          question_id: option.question_id,
          position: option.position,
          text: option.text,
          is_correct: option.is_correct,
        })),
    })),
  }));
}

function persistDocument(tx: QuizTransaction, document: AuthoringQuizDocument) {
  const existingQuestions = Array.from(tx.db.questions.quiz_id.filter(document.quiz.quiz_id)) as StoredQuestionRow[];

  for (const question of existingQuestions) {
    for (const option of Array.from(tx.db.questionOptions.question_id.filter(question.question_id)) as StoredQuestionOptionRow[]) {
      tx.db.questionOptions.option_id.delete(option.option_id);
    }
    tx.db.questions.question_id.delete(question.question_id);
  }

  tx.db.quizzes.quiz_id.delete(document.quiz.quiz_id);
  tx.db.quizzes.insert({
    quiz_id: document.quiz.quiz_id,
    owner_user_id: document.quiz.owner_user_id,
    title: document.quiz.title,
    description: document.quiz.description,
    status: document.quiz.status,
    default_scoring_mode: document.quiz.default_scoring_mode,
    default_question_time_limit_seconds: document.quiz.default_question_time_limit_seconds,
    shuffle_answers_default: document.quiz.shuffle_answers_default,
    question_count: document.questions.length,
    created_at: document.quiz.created_at,
    updated_at: document.quiz.updated_at,
    published_at: document.quiz.published_at,
  });

  for (const entry of document.questions) {
    tx.db.questions.insert({
      question_id: entry.question.question_id,
      quiz_id: entry.question.quiz_id,
      position: entry.question.position,
      prompt: entry.question.prompt,
      question_type: entry.question.question_type,
      evaluation_policy: entry.question.evaluation_policy,
      base_points: entry.question.base_points,
      time_limit_seconds: entry.question.time_limit_seconds,
      shuffle_answers: entry.question.shuffle_answers,
      created_at: entry.question.created_at,
      updated_at: entry.question.updated_at,
    });
    for (const option of entry.options) {
      tx.db.questionOptions.insert({ ...option });
    }
  }
}

function toSpacetimeQuizDocument(document: AuthoringQuizDocument): SpacetimeAuthoringQuizDocument {
  return {
    quiz: {
      ...document.quiz,
      published_at: document.quiz.published_at,
    },
    questions: document.questions.map((entry) => ({
      question: {
        ...entry.question,
        time_limit_seconds: entry.question.time_limit_seconds,
        shuffle_answers: entry.question.shuffle_answers,
      },
      options: entry.options.map((option) => ({ ...option })),
    })),
  };
}

function createRuntimeRoomPolicy(quiz: StoredQuizRow) {
  return {
    scoring_mode: quiz.default_scoring_mode,
    question_time_limit_seconds: quiz.default_question_time_limit_seconds,
    shuffle_answers: quiz.shuffle_answers_default,
    late_join_allowed: false,
  };
}

function buildRuntimeQuestionSnapshots(
  tx: QuizTransaction,
  quiz: StoredQuizRow,
  roomId: string,
): StoredRuntimeQuestionSnapshotRow[] {
  return (Array.from(tx.db.questions.quiz_id.filter(quiz.quiz_id)) as StoredQuestionRow[])
    .sort((left, right) => left.position - right.position)
    .map((question, questionIndex) => ({
      snapshot_id: `${roomId}:question:${questionIndex}`,
      room_id: roomId,
      question_index: questionIndex,
      source_question_id: question.question_id,
      prompt: question.prompt,
      question_type: question.question_type,
      evaluation_policy: question.evaluation_policy,
      base_points: question.base_points,
      effective_time_limit_seconds: question.time_limit_seconds ?? quiz.default_question_time_limit_seconds,
      shuffle_answers: question.shuffle_answers ?? quiz.shuffle_answers_default,
    }));
}

function buildRuntimeQuestionOptionSnapshots(
  tx: QuizTransaction,
  quiz: StoredQuizRow,
  roomId: string,
  questionSnapshots: StoredRuntimeQuestionSnapshotRow[],
): StoredRuntimeQuestionOptionSnapshotRow[] {
  return questionSnapshots.flatMap((questionSnapshot) => {
    const question = tx.db.questions.question_id.find(questionSnapshot.source_question_id) as StoredQuestionRow | null;
    if (!question) {
      throw new Error(`Question ${questionSnapshot.source_question_id} was not found for quiz ${quiz.quiz_id}`);
    }

    const orderedOptions = (Array.from(tx.db.questionOptions.question_id.filter(question.question_id)) as StoredQuestionOptionRow[]).sort(
      (left, right) => left.position - right.position,
    );
    const displayPositions = questionSnapshot.shuffle_answers
      ? orderedOptions.map((_, index, all) => all.length - index)
      : orderedOptions.map((_, index) => index + 1);

    return orderedOptions.map((option, optionIndex) => ({
      snapshot_id: `${roomId}:question:${questionSnapshot.question_index}:option:${option.option_id}`,
      room_id: roomId,
      question_index: questionSnapshot.question_index,
      source_option_id: option.option_id,
      author_position: option.position,
      display_position: displayPositions[optionIndex],
      text: option.text,
      is_correct: option.is_correct,
    }));
  });
}

function toRuntimeBootstrapPayload(
  room: StoredRuntimeRoomRow,
  questionSnapshots: StoredRuntimeQuestionSnapshotRow[],
  optionSnapshots: StoredRuntimeQuestionOptionSnapshotRow[],
): SpacetimeRuntimeBootstrapPayload {
  return {
    room: {
      room_id: room.room_id,
      room_code: room.room_code,
      source_quiz_id: room.source_quiz_id,
      lifecycle_state: room.lifecycle_state,
      current_question_index: room.current_question_index,
      host_binding: {
        clerk_user_id: room.host_clerk_user_id,
        host_binding_version: room.host_binding_version,
      },
      created_at: room.created_at,
      started_at: room.started_at,
      ended_at: room.ended_at,
      expires_at: room.expires_at,
      room_policy: {
        scoring_mode: room.scoring_mode,
        question_time_limit_seconds: room.question_time_limit_seconds,
        shuffle_answers: room.shuffle_answers,
        late_join_allowed: room.late_join_allowed,
      },
    },
    question_snapshots: questionSnapshots.map((snapshot) => ({
      room_id: snapshot.room_id,
      question_index: snapshot.question_index,
      source_question_id: snapshot.source_question_id,
      prompt: snapshot.prompt,
      question_type: snapshot.question_type,
      evaluation_policy: snapshot.evaluation_policy,
      base_points: snapshot.base_points,
      effective_time_limit_seconds: snapshot.effective_time_limit_seconds,
      shuffle_answers: snapshot.shuffle_answers,
    })),
    option_snapshots: optionSnapshots.map((snapshot) => ({
      room_id: snapshot.room_id,
      question_index: snapshot.question_index,
      source_option_id: snapshot.source_option_id,
      author_position: snapshot.author_position,
      display_position: snapshot.display_position,
      text: snapshot.text,
      is_correct: snapshot.is_correct,
    })),
  };
}

function createUniqueRoomCode(
  tx: QuizTransaction,
  random: { integerInRange(min: number, max: number): number },
): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  for (let attempt = 0; attempt < 24; attempt += 1) {
    let roomCode = '';
    for (let index = 0; index < 6; index += 1) {
      roomCode += alphabet[random.integerInRange(0, alphabet.length - 1)];
    }

    if (!tx.db.runtimeRooms.room_code.find(roomCode)) {
      return roomCode;
    }
  }

  throw new Error('Unable to allocate a unique room code');
}