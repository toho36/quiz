type ValidationIssue = {
  message: string;
};

type ParseSuccess<T> = {
  success: true;
  data: T;
};

type ParseFailure = {
  success: false;
  error: {
    issues: ValidationIssue[];
  };
};

type ParseResult<T> = ParseSuccess<T> | ParseFailure;

export type Schema<T> = {
  safeParse(input: unknown): ParseResult<T>;
  parse(input: unknown): T;
};

class ValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues[0]?.message ?? 'Validation failed');
    this.name = 'ValidationError';
  }
}

function createSchema<T>(validator: (input: unknown) => T): Schema<T> {
  return {
    parse(input) {
      return validator(input);
    },
    safeParse(input) {
      try {
        return { success: true, data: validator(input) };
      } catch (error) {
        if (error instanceof ValidationError) {
          return { success: false, error: { issues: error.issues } };
        }

        return {
          success: false,
          error: { issues: [{ message: error instanceof Error ? error.message : 'Validation failed' }] },
        };
      }
    },
  };
}

function fail(message: string): never {
  throw new ValidationError([{ message }]);
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

function asRecord(input: unknown, label: string): Record<string, unknown> {
  assertCondition(typeof input === 'object' && input !== null && !Array.isArray(input), `${label} must be an object`);
  return input as Record<string, unknown>;
}

function asArray(input: unknown, label: string): unknown[] {
  assertCondition(Array.isArray(input), `${label} must be an array`);
  return input;
}

function asTrimmedString(input: unknown, label: string): string {
  assertCondition(typeof input === 'string', `${label} must be a string`);
  const value = input.trim();
  assertCondition(value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function asBoolean(input: unknown, label: string): boolean {
  assertCondition(typeof input === 'boolean', `${label} must be a boolean`);
  return input;
}

function asInteger(input: unknown, label: string, minimum = 0): number {
  assertCondition(typeof input === 'number' && Number.isInteger(input), `${label} must be an integer`);
  assertCondition(input >= minimum, `${label} must be at least ${minimum}`);
  return input;
}

function asIsoTimestamp(input: unknown, label: string): string {
  const value = asTrimmedString(input, label);
  assertCondition(!Number.isNaN(Date.parse(value)), `${label} must be an ISO timestamp string`);
  return value;
}

function asNullableIsoTimestamp(input: unknown, label: string): string | null {
  if (input === null) {
    return null;
  }

  return asIsoTimestamp(input, label);
}

function asOptionalIsoTimestamp(input: unknown, label: string): string | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }

  return asIsoTimestamp(input, label);
}

function asLiteralFalse(input: unknown, label: string): false {
  assertCondition(input === false, `${label} must be false for the MVP contract`);
  return false;
}

function asEnumValue<T extends readonly string[]>(input: unknown, values: T, label: string): T[number] {
  const value = asTrimmedString(input, label);
  assertCondition(values.includes(value), `${label} must be one of: ${values.join(', ')}`);
  return value as T[number];
}

function assertUnique(values: Iterable<string | number>, label: string) {
  const seen = new Set<string | number>();
  for (const value of values) {
    assertCondition(!seen.has(value), `${label} must not contain duplicates`);
    seen.add(value);
  }
}

const QUIZ_STATUSES = ['draft', 'published', 'archived'] as const;
const SCORING_MODES = ['speed_weighted', 'correctness_only'] as const;
const QUESTION_TYPES = ['single_choice', 'multiple_choice'] as const;
const EVALUATION_POLICIES = ['exact_match'] as const;
const ROOM_LIFECYCLE_STATES = ['lobby', 'in_progress', 'finished', 'aborted', 'expired'] as const;
const QUESTION_PHASES = ['question_open', 'question_closed', 'reveal', 'leaderboard'] as const;
const ROOM_PLAYER_STATUSES = ['waiting', 'connected', 'disconnected'] as const;
const PLAYER_SUBMISSION_STATUSES = ['not_submitted', 'submitted', 'accepted', 'rejected', 'late', 'no_answer'] as const;
const SUBMISSION_RECORD_STATUSES = ['accepted', 'rejected', 'late', 'no_answer'] as const;
const HOST_ALLOWED_ACTIONS = [
  'start_game',
  'close_question',
  'reveal',
  'show_leaderboard',
  'next_question',
  'finish_game',
  'abort_game',
] as const;

export const CONTRACT_LIMITS = {
  publishedQuizQuestionCount: { min: 1, max: 50 },
  singleChoiceOptionCount: { min: 2, max: 6 },
  multipleChoiceOptionCount: { min: 3, max: 6 },
  hostClaimTtlSeconds: 60,
  playerReconnectMaxTtlSeconds: 12 * 60 * 60,
} as const;

export type QuizStatus = (typeof QUIZ_STATUSES)[number];
export type ScoringMode = (typeof SCORING_MODES)[number];
export type QuestionType = (typeof QUESTION_TYPES)[number];
export type EvaluationPolicy = (typeof EVALUATION_POLICIES)[number];
export type RoomLifecycleState = (typeof ROOM_LIFECYCLE_STATES)[number];
export type QuestionPhase = (typeof QUESTION_PHASES)[number];
export type RoomPlayerStatus = (typeof ROOM_PLAYER_STATUSES)[number];
export type PlayerSubmissionStatus = (typeof PLAYER_SUBMISSION_STATUSES)[number];
export type SubmissionRecordStatus = (typeof SUBMISSION_RECORD_STATUSES)[number];
export type HostAllowedAction = (typeof HOST_ALLOWED_ACTIONS)[number];

export type RoomPolicy = {
  scoring_mode: ScoringMode;
  question_time_limit_seconds: number;
  shuffle_answers: boolean;
  late_join_allowed: false;
};

export type AuthoringQuiz = {
  quiz_id: string;
  owner_user_id: string;
  title: string;
  description: string;
  status: QuizStatus;
  default_scoring_mode: ScoringMode;
  default_question_time_limit_seconds: number;
  shuffle_answers_default: boolean;
  created_at: string;
  updated_at: string;
  published_at?: string;
};

export type AuthoringQuestion = {
  question_id: string;
  quiz_id: string;
  position: number;
  prompt: string;
  question_type: QuestionType;
  evaluation_policy: EvaluationPolicy;
  base_points: number;
  time_limit_seconds?: number;
  shuffle_answers?: boolean;
  created_at: string;
  updated_at: string;
};

export type AuthoringQuestionOption = {
  option_id: string;
  question_id: string;
  position: number;
  text: string;
  is_correct: boolean;
};

export type AuthoringQuizQuestionDocument = {
  question: AuthoringQuestion;
  options: AuthoringQuestionOption[];
};

export type AuthoringQuizDocument = {
  quiz: AuthoringQuiz;
  questions: AuthoringQuizQuestionDocument[];
};

export type CreateRoomResponse = {
  room_id: string;
  room_code: string;
  source_quiz_id: string;
  room_policy: RoomPolicy;
  host_claim_token: string;
  host_claim_expires_at: string;
};

export type HostClaimTokenClaims = {
  purpose: 'host_claim';
  room_id: string;
  clerk_user_id: string;
  clerk_session_id: string;
  jti: string;
  iat: number;
  exp: number;
  v: number;
};

export type HostClaimCommand = {
  room_id: string;
  host_claim_token: string;
  transport_session_id?: string;
};

export type PlayerJoinCommand = {
  room_code: string;
  display_name: string;
  client_join_request_id?: string;
};

export type PlayerReconnectCommand = {
  room_id: string;
  room_player_id: string;
  resume_token: string;
};

export type AnswerSubmissionCommand = {
  room_id: string;
  question_index: number;
  selected_option_ids: string[];
  client_request_id?: string;
};

export type RuntimeRoom = {
  room_id: string;
  room_code: string;
  source_quiz_id: string;
  lifecycle_state: RoomLifecycleState;
  current_question_index: number | null;
  host_binding: {
    clerk_user_id: string;
    host_binding_version: number;
  };
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  expires_at: string;
  room_policy: RoomPolicy;
};

export type RuntimeRoomPlayer = {
  room_player_id: string;
  room_id: string;
  display_name: string;
  status: RoomPlayerStatus;
  resume_token_hash: string;
  joined_at: string;
  last_seen_at: string;
  score_total: number;
  correct_count: number;
  join_order: number;
};

export type RuntimeQuestionSnapshot = {
  room_id: string;
  question_index: number;
  source_question_id: string;
  prompt: string;
  question_type: QuestionType;
  evaluation_policy: EvaluationPolicy;
  base_points: number;
  effective_time_limit_seconds: number | null;
  shuffle_answers: boolean;
};

export type RuntimeQuestionOptionSnapshot = {
  room_id: string;
  question_index: number;
  source_option_id: string;
  author_position: number;
  display_position: number;
  text: string;
  is_correct: boolean;
};

export type RuntimeQuestionState = {
  room_id: string;
  question_index: number;
  phase: QuestionPhase;
  opened_at: string;
  deadline_at: string | null;
  closed_at: string | null;
  revealed_at: string | null;
  leaderboard_shown_at: string | null;
};

export type AnswerSubmissionRecord = {
  room_id: string;
  question_index: number;
  room_player_id: string;
  accepted_at: string;
  is_correct: boolean;
  awarded_points: number;
  submission_status: SubmissionRecordStatus;
};

export type AnswerSelection = {
  room_id: string;
  question_index: number;
  room_player_id: string;
  source_option_id: string;
};

export type LeaderboardEntry = {
  room_player_id: string;
  display_name: string;
  score_total: number;
  correct_count: number;
  rank: number;
};

export type PlayerLatestOutcome = {
  is_correct: boolean;
  awarded_points: number;
};

export type PlayerRoomState = {
  shared_room: {
    room_id: string;
    room_code: string;
    lifecycle_state: RoomLifecycleState;
    question_index: number | null;
    question_phase: QuestionPhase | null;
    question_deadline_at: string | null;
    room_policy: RoomPolicy;
  };
  active_question: {
    question_index: number;
    prompt: string;
    question_type: QuestionType;
    display_options: Array<{
      option_id: string;
      display_position: number;
      text: string;
    }>;
  } | null;
  self: {
    room_player_id: string;
    display_name: string;
    score_total: number;
    correct_count: number;
    submission_status: PlayerSubmissionStatus;
    latest_outcome: PlayerLatestOutcome | null;
  };
  leaderboard: LeaderboardEntry[] | null;
};

export type HostRoomState = {
  shared_room: PlayerRoomState['shared_room'];
  active_question: PlayerRoomState['active_question'];
  joined_player_count: number;
  connected_player_count: number;
  submission_progress: {
    submitted_player_count: number;
    total_player_count: number;
  };
  allowed_actions: HostAllowedAction[];
  leaderboard: LeaderboardEntry[] | null;
};

function parseRoomPolicy(input: unknown, label: string): RoomPolicy {
  const record = asRecord(input, label);
  return {
    scoring_mode: asEnumValue(record.scoring_mode, SCORING_MODES, `${label}.scoring_mode`),
    question_time_limit_seconds: asInteger(record.question_time_limit_seconds, `${label}.question_time_limit_seconds`, 1),
    shuffle_answers: asBoolean(record.shuffle_answers, `${label}.shuffle_answers`),
    late_join_allowed: asLiteralFalse(record.late_join_allowed, `${label}.late_join_allowed`),
  };
}

function parseAuthoringQuiz(input: unknown): AuthoringQuiz {
  const record = asRecord(input, 'quiz');
  return {
    quiz_id: asTrimmedString(record.quiz_id, 'quiz.quiz_id'),
    owner_user_id: asTrimmedString(record.owner_user_id, 'quiz.owner_user_id'),
    title: asTrimmedString(record.title, 'quiz.title'),
    description: asTrimmedString(record.description, 'quiz.description'),
    status: asEnumValue(record.status, QUIZ_STATUSES, 'quiz.status'),
    default_scoring_mode: asEnumValue(record.default_scoring_mode, SCORING_MODES, 'quiz.default_scoring_mode'),
    default_question_time_limit_seconds: asInteger(
      record.default_question_time_limit_seconds,
      'quiz.default_question_time_limit_seconds',
      1,
    ),
    shuffle_answers_default: asBoolean(record.shuffle_answers_default, 'quiz.shuffle_answers_default'),
    created_at: asIsoTimestamp(record.created_at, 'quiz.created_at'),
    updated_at: asIsoTimestamp(record.updated_at, 'quiz.updated_at'),
    published_at: asOptionalIsoTimestamp(record.published_at, 'quiz.published_at'),
  };
}

function parseAuthoringQuestion(input: unknown, label: string): AuthoringQuestion {
  const record = asRecord(input, label);
  return {
    question_id: asTrimmedString(record.question_id, `${label}.question_id`),
    quiz_id: asTrimmedString(record.quiz_id, `${label}.quiz_id`),
    position: asInteger(record.position, `${label}.position`, 1),
    prompt: asTrimmedString(record.prompt, `${label}.prompt`),
    question_type: asEnumValue(record.question_type, QUESTION_TYPES, `${label}.question_type`),
    evaluation_policy: asEnumValue(record.evaluation_policy, EVALUATION_POLICIES, `${label}.evaluation_policy`),
    base_points: asInteger(record.base_points, `${label}.base_points`, 1),
    time_limit_seconds:
      record.time_limit_seconds === undefined ? undefined : asInteger(record.time_limit_seconds, `${label}.time_limit_seconds`, 1),
    shuffle_answers: record.shuffle_answers === undefined ? undefined : asBoolean(record.shuffle_answers, `${label}.shuffle_answers`),
    created_at: asIsoTimestamp(record.created_at, `${label}.created_at`),
    updated_at: asIsoTimestamp(record.updated_at, `${label}.updated_at`),
  };
}

function parseAuthoringOption(input: unknown, label: string): AuthoringQuestionOption {
  const record = asRecord(input, label);
  return {
    option_id: asTrimmedString(record.option_id, `${label}.option_id`),
    question_id: asTrimmedString(record.question_id, `${label}.question_id`),
    position: asInteger(record.position, `${label}.position`, 1),
    text: asTrimmedString(record.text, `${label}.text`),
    is_correct: asBoolean(record.is_correct, `${label}.is_correct`),
  };
}

function parseLeaderboard(input: unknown, label: string): LeaderboardEntry[] | null {
  if (input === null) {
    return null;
  }

  const items = asArray(input, label).map((item, index) => {
    const record = asRecord(item, `${label}[${index}]`);
    return {
      room_player_id: asTrimmedString(record.room_player_id, `${label}[${index}].room_player_id`),
      display_name: asTrimmedString(record.display_name, `${label}[${index}].display_name`),
      score_total: asInteger(record.score_total, `${label}[${index}].score_total`, 0),
      correct_count: asInteger(record.correct_count, `${label}[${index}].correct_count`, 0),
      rank: asInteger(record.rank, `${label}[${index}].rank`, 1),
    };
  });

  assertUnique(items.map((item) => item.rank), `${label}.rank`);
  return items;
}

function assertLeaderboardPhase(
  lifecycleState: RoomLifecycleState,
  phase: QuestionPhase | null,
  leaderboard: LeaderboardEntry[] | null,
  label: string,
) {
  if (!leaderboard) {
    return;
  }

  const phaseAllowsLeaderboard = phase === 'reveal' || phase === 'leaderboard';
  assertCondition(
    lifecycleState !== 'in_progress' || phaseAllowsLeaderboard,
    `${label}.leaderboard is only available during reveal, leaderboard, or read-only post-game views`,
  );
}

export const authoringQuizDocumentSchema = createSchema<AuthoringQuizDocument>((input) => {
  const record = asRecord(input, 'authoringQuizDocument');
  const quiz = parseAuthoringQuiz(record.quiz);
  const questions = asArray(record.questions, 'authoringQuizDocument.questions').map((item, index) => {
    const questionRecord = asRecord(item, `authoringQuizDocument.questions[${index}]`);
    const question = parseAuthoringQuestion(questionRecord.question, `authoringQuizDocument.questions[${index}].question`);
    const options = asArray(questionRecord.options, `authoringQuizDocument.questions[${index}].options`).map((option, optionIndex) =>
      parseAuthoringOption(option, `authoringQuizDocument.questions[${index}].options[${optionIndex}]`),
    );

    assertCondition(question.quiz_id === quiz.quiz_id, `authoringQuizDocument.questions[${index}].question.quiz_id must match quiz.quiz_id`);
    assertCondition(options.length <= CONTRACT_LIMITS.singleChoiceOptionCount.max, `authoringQuizDocument.questions[${index}].options must contain at most 6 options`);
    assertUnique(options.map((option) => option.position), `authoringQuizDocument.questions[${index}].options.position`);

    for (const option of options) {
      assertCondition(
        option.question_id === question.question_id,
        `authoringQuizDocument.questions[${index}].options question_id must match the parent question_id`,
      );
    }

    const correctCount = options.filter((option) => option.is_correct).length;
    if (question.question_type === 'single_choice') {
      assertCondition(
        options.length >= CONTRACT_LIMITS.singleChoiceOptionCount.min && options.length <= CONTRACT_LIMITS.singleChoiceOptionCount.max,
        `authoringQuizDocument.questions[${index}] single_choice questions must contain 2 to 6 options`,
      );
      assertCondition(correctCount === 1, `authoringQuizDocument.questions[${index}] single_choice questions must have exactly one correct option`);
    }

    if (question.question_type === 'multiple_choice') {
      assertCondition(
        options.length >= CONTRACT_LIMITS.multipleChoiceOptionCount.min && options.length <= CONTRACT_LIMITS.multipleChoiceOptionCount.max,
        `authoringQuizDocument.questions[${index}] multiple_choice questions must contain 3 to 6 options`,
      );
      assertCondition(correctCount >= 2, `authoringQuizDocument.questions[${index}] multiple_choice questions must have at least two correct options`);
      assertCondition(correctCount < options.length, `authoringQuizDocument.questions[${index}] multiple_choice questions must include at least one incorrect option`);
    }

    return { question, options };
  });

  assertUnique(questions.map((entry) => entry.question.position), 'authoringQuizDocument.questions.position');

  if (quiz.status === 'published') {
    assertCondition(
      questions.length >= CONTRACT_LIMITS.publishedQuizQuestionCount.min && questions.length <= CONTRACT_LIMITS.publishedQuizQuestionCount.max,
      'Published quizzes must contain 1 to 50 questions',
    );
  }

  return { quiz, questions };
});

export const createRoomResponseSchema = createSchema<CreateRoomResponse>((input) => {
  const record = asRecord(input, 'createRoomResponse');
  return {
    room_id: asTrimmedString(record.room_id, 'createRoomResponse.room_id'),
    room_code: asTrimmedString(record.room_code, 'createRoomResponse.room_code'),
    source_quiz_id: asTrimmedString(record.source_quiz_id, 'createRoomResponse.source_quiz_id'),
    room_policy: parseRoomPolicy(record.room_policy, 'createRoomResponse.room_policy'),
    host_claim_token: asTrimmedString(record.host_claim_token, 'createRoomResponse.host_claim_token'),
    host_claim_expires_at: asIsoTimestamp(record.host_claim_expires_at, 'createRoomResponse.host_claim_expires_at'),
  };
});

export const hostClaimTokenClaimsSchema = createSchema<HostClaimTokenClaims>((input) => {
  const record = asRecord(input, 'hostClaimTokenClaims');
  const claims: HostClaimTokenClaims = {
    purpose: asEnumValue(record.purpose, ['host_claim'] as const, 'hostClaimTokenClaims.purpose'),
    room_id: asTrimmedString(record.room_id, 'hostClaimTokenClaims.room_id'),
    clerk_user_id: asTrimmedString(record.clerk_user_id, 'hostClaimTokenClaims.clerk_user_id'),
    clerk_session_id: asTrimmedString(record.clerk_session_id, 'hostClaimTokenClaims.clerk_session_id'),
    jti: asTrimmedString(record.jti, 'hostClaimTokenClaims.jti'),
    iat: asInteger(record.iat, 'hostClaimTokenClaims.iat', 0),
    exp: asInteger(record.exp, 'hostClaimTokenClaims.exp', 1),
    v: asInteger(record.v, 'hostClaimTokenClaims.v', 1),
  };

  assertCondition(claims.exp > claims.iat, 'hostClaimTokenClaims.exp must be greater than iat');
  assertCondition(
    claims.exp - claims.iat <= CONTRACT_LIMITS.hostClaimTtlSeconds,
    `hostClaimTokenClaims.exp must be within ${CONTRACT_LIMITS.hostClaimTtlSeconds} seconds of iat`,
  );

  return claims;
});

export const hostClaimCommandSchema = createSchema<HostClaimCommand>((input) => {
  const record = asRecord(input, 'hostClaimCommand');
  return {
    room_id: asTrimmedString(record.room_id, 'hostClaimCommand.room_id'),
    host_claim_token: asTrimmedString(record.host_claim_token, 'hostClaimCommand.host_claim_token'),
    transport_session_id:
      record.transport_session_id === undefined ? undefined : asTrimmedString(record.transport_session_id, 'hostClaimCommand.transport_session_id'),
  };
});

export const playerJoinCommandSchema = createSchema<PlayerJoinCommand>((input) => {
  const record = asRecord(input, 'playerJoinCommand');
  return {
    room_code: asTrimmedString(record.room_code, 'playerJoinCommand.room_code'),
    display_name: asTrimmedString(record.display_name, 'playerJoinCommand.display_name'),
    client_join_request_id:
      record.client_join_request_id === undefined
        ? undefined
        : asTrimmedString(record.client_join_request_id, 'playerJoinCommand.client_join_request_id'),
  };
});

export const playerReconnectCommandSchema = createSchema<PlayerReconnectCommand>((input) => {
  const record = asRecord(input, 'playerReconnectCommand');
  return {
    room_id: asTrimmedString(record.room_id, 'playerReconnectCommand.room_id'),
    room_player_id: asTrimmedString(record.room_player_id, 'playerReconnectCommand.room_player_id'),
    resume_token: asTrimmedString(record.resume_token, 'playerReconnectCommand.resume_token'),
  };
});

export const answerSubmissionCommandSchema = createSchema<AnswerSubmissionCommand>((input) => {
  const record = asRecord(input, 'answerSubmissionCommand');
  const selectedOptionIds = asArray(record.selected_option_ids, 'answerSubmissionCommand.selected_option_ids').map((value, index) =>
    asTrimmedString(value, `answerSubmissionCommand.selected_option_ids[${index}]`),
  );

  assertCondition(selectedOptionIds.length > 0, 'answerSubmissionCommand.selected_option_ids must contain at least one option id');
  assertUnique(selectedOptionIds, 'answerSubmissionCommand.selected_option_ids');

  return {
    room_id: asTrimmedString(record.room_id, 'answerSubmissionCommand.room_id'),
    question_index: asInteger(record.question_index, 'answerSubmissionCommand.question_index', 0),
    selected_option_ids: selectedOptionIds,
    client_request_id:
      record.client_request_id === undefined
        ? undefined
        : asTrimmedString(record.client_request_id, 'answerSubmissionCommand.client_request_id'),
  };
});

export const runtimeRoomSchema = createSchema<RuntimeRoom>((input) => {
  const record = asRecord(input, 'runtimeRoom');
  const hostBinding = asRecord(record.host_binding, 'runtimeRoom.host_binding');
  return {
    room_id: asTrimmedString(record.room_id, 'runtimeRoom.room_id'),
    room_code: asTrimmedString(record.room_code, 'runtimeRoom.room_code'),
    source_quiz_id: asTrimmedString(record.source_quiz_id, 'runtimeRoom.source_quiz_id'),
    lifecycle_state: asEnumValue(record.lifecycle_state, ROOM_LIFECYCLE_STATES, 'runtimeRoom.lifecycle_state'),
    current_question_index:
      record.current_question_index === null ? null : asInteger(record.current_question_index, 'runtimeRoom.current_question_index', 0),
    host_binding: {
      clerk_user_id: asTrimmedString(hostBinding.clerk_user_id, 'runtimeRoom.host_binding.clerk_user_id'),
      host_binding_version: asInteger(hostBinding.host_binding_version, 'runtimeRoom.host_binding.host_binding_version', 1),
    },
    created_at: asIsoTimestamp(record.created_at, 'runtimeRoom.created_at'),
    started_at: asNullableIsoTimestamp(record.started_at, 'runtimeRoom.started_at'),
    ended_at: asNullableIsoTimestamp(record.ended_at, 'runtimeRoom.ended_at'),
    expires_at: asIsoTimestamp(record.expires_at, 'runtimeRoom.expires_at'),
    room_policy: parseRoomPolicy(record.room_policy, 'runtimeRoom.room_policy'),
  };
});

export const runtimeRoomPlayerSchema = createSchema<RuntimeRoomPlayer>((input) => {
  const record = asRecord(input, 'runtimeRoomPlayer');
  return {
    room_player_id: asTrimmedString(record.room_player_id, 'runtimeRoomPlayer.room_player_id'),
    room_id: asTrimmedString(record.room_id, 'runtimeRoomPlayer.room_id'),
    display_name: asTrimmedString(record.display_name, 'runtimeRoomPlayer.display_name'),
    status: asEnumValue(record.status, ROOM_PLAYER_STATUSES, 'runtimeRoomPlayer.status'),
    resume_token_hash: asTrimmedString(record.resume_token_hash, 'runtimeRoomPlayer.resume_token_hash'),
    joined_at: asIsoTimestamp(record.joined_at, 'runtimeRoomPlayer.joined_at'),
    last_seen_at: asIsoTimestamp(record.last_seen_at, 'runtimeRoomPlayer.last_seen_at'),
    score_total: asInteger(record.score_total, 'runtimeRoomPlayer.score_total', 0),
    correct_count: asInteger(record.correct_count, 'runtimeRoomPlayer.correct_count', 0),
    join_order: asInteger(record.join_order, 'runtimeRoomPlayer.join_order', 1),
  };
});

export const runtimeQuestionSnapshotSchema = createSchema<RuntimeQuestionSnapshot>((input) => {
  const record = asRecord(input, 'runtimeQuestionSnapshot');
  return {
    room_id: asTrimmedString(record.room_id, 'runtimeQuestionSnapshot.room_id'),
    question_index: asInteger(record.question_index, 'runtimeQuestionSnapshot.question_index', 0),
    source_question_id: asTrimmedString(record.source_question_id, 'runtimeQuestionSnapshot.source_question_id'),
    prompt: asTrimmedString(record.prompt, 'runtimeQuestionSnapshot.prompt'),
    question_type: asEnumValue(record.question_type, QUESTION_TYPES, 'runtimeQuestionSnapshot.question_type'),
    evaluation_policy: asEnumValue(record.evaluation_policy, EVALUATION_POLICIES, 'runtimeQuestionSnapshot.evaluation_policy'),
    base_points: asInteger(record.base_points, 'runtimeQuestionSnapshot.base_points', 1),
    effective_time_limit_seconds:
      record.effective_time_limit_seconds === null
        ? null
        : asInteger(record.effective_time_limit_seconds, 'runtimeQuestionSnapshot.effective_time_limit_seconds', 1),
    shuffle_answers: asBoolean(record.shuffle_answers, 'runtimeQuestionSnapshot.shuffle_answers'),
  };
});

export const runtimeQuestionOptionSnapshotSchema = createSchema<RuntimeQuestionOptionSnapshot>((input) => {
  const record = asRecord(input, 'runtimeQuestionOptionSnapshot');
  return {
    room_id: asTrimmedString(record.room_id, 'runtimeQuestionOptionSnapshot.room_id'),
    question_index: asInteger(record.question_index, 'runtimeQuestionOptionSnapshot.question_index', 0),
    source_option_id: asTrimmedString(record.source_option_id, 'runtimeQuestionOptionSnapshot.source_option_id'),
    author_position: asInteger(record.author_position, 'runtimeQuestionOptionSnapshot.author_position', 1),
    display_position: asInteger(record.display_position, 'runtimeQuestionOptionSnapshot.display_position', 1),
    text: asTrimmedString(record.text, 'runtimeQuestionOptionSnapshot.text'),
    is_correct: asBoolean(record.is_correct, 'runtimeQuestionOptionSnapshot.is_correct'),
  };
});

export const runtimeQuestionStateSchema = createSchema<RuntimeQuestionState>((input) => {
  const record = asRecord(input, 'runtimeQuestionState');
  const state: RuntimeQuestionState = {
    room_id: asTrimmedString(record.room_id, 'runtimeQuestionState.room_id'),
    question_index: asInteger(record.question_index, 'runtimeQuestionState.question_index', 0),
    phase: asEnumValue(record.phase, QUESTION_PHASES, 'runtimeQuestionState.phase'),
    opened_at: asIsoTimestamp(record.opened_at, 'runtimeQuestionState.opened_at'),
    deadline_at: asNullableIsoTimestamp(record.deadline_at, 'runtimeQuestionState.deadline_at'),
    closed_at: asNullableIsoTimestamp(record.closed_at, 'runtimeQuestionState.closed_at'),
    revealed_at: asNullableIsoTimestamp(record.revealed_at, 'runtimeQuestionState.revealed_at'),
    leaderboard_shown_at: asNullableIsoTimestamp(record.leaderboard_shown_at, 'runtimeQuestionState.leaderboard_shown_at'),
  };

  if (state.phase === 'question_open') {
    assertCondition(state.closed_at === null, 'runtimeQuestionState.closed_at must be null while the question is open');
    assertCondition(state.revealed_at === null, 'runtimeQuestionState.revealed_at must be null while the question is open');
    assertCondition(state.leaderboard_shown_at === null, 'runtimeQuestionState.leaderboard_shown_at must be null while the question is open');
  }

  if (state.phase === 'question_closed') {
    assertCondition(state.closed_at !== null, 'runtimeQuestionState.closed_at is required once the question is closed');
    assertCondition(state.revealed_at === null, 'runtimeQuestionState.revealed_at must be null before reveal');
    assertCondition(state.leaderboard_shown_at === null, 'runtimeQuestionState.leaderboard_shown_at must be null before leaderboard');
  }

  if (state.phase === 'reveal') {
    assertCondition(state.closed_at !== null, 'runtimeQuestionState.closed_at is required during reveal');
    assertCondition(state.revealed_at !== null, 'runtimeQuestionState.revealed_at is required during reveal');
    assertCondition(state.leaderboard_shown_at === null, 'runtimeQuestionState.leaderboard_shown_at must be null before leaderboard');
  }

  if (state.phase === 'leaderboard') {
    assertCondition(state.closed_at !== null, 'runtimeQuestionState.closed_at is required during leaderboard');
    assertCondition(state.revealed_at !== null, 'runtimeQuestionState.revealed_at is required during leaderboard');
    assertCondition(state.leaderboard_shown_at !== null, 'runtimeQuestionState.leaderboard_shown_at is required during leaderboard');
  }

  return state;
});

export const answerSubmissionRecordSchema = createSchema<AnswerSubmissionRecord>((input) => {
  const record = asRecord(input, 'answerSubmissionRecord');
  return {
    room_id: asTrimmedString(record.room_id, 'answerSubmissionRecord.room_id'),
    question_index: asInteger(record.question_index, 'answerSubmissionRecord.question_index', 0),
    room_player_id: asTrimmedString(record.room_player_id, 'answerSubmissionRecord.room_player_id'),
    accepted_at: asIsoTimestamp(record.accepted_at, 'answerSubmissionRecord.accepted_at'),
    is_correct: asBoolean(record.is_correct, 'answerSubmissionRecord.is_correct'),
    awarded_points: asInteger(record.awarded_points, 'answerSubmissionRecord.awarded_points', 0),
    submission_status: asEnumValue(record.submission_status, SUBMISSION_RECORD_STATUSES, 'answerSubmissionRecord.submission_status'),
  };
});

export const answerSelectionSchema = createSchema<AnswerSelection>((input) => {
  const record = asRecord(input, 'answerSelection');
  return {
    room_id: asTrimmedString(record.room_id, 'answerSelection.room_id'),
    question_index: asInteger(record.question_index, 'answerSelection.question_index', 0),
    room_player_id: asTrimmedString(record.room_player_id, 'answerSelection.room_player_id'),
    source_option_id: asTrimmedString(record.source_option_id, 'answerSelection.source_option_id'),
  };
});

function parseSharedRoomCore(input: unknown, label: string): PlayerRoomState['shared_room'] {
  const record = asRecord(input, label);
  return {
    room_id: asTrimmedString(record.room_id, `${label}.room_id`),
    room_code: asTrimmedString(record.room_code, `${label}.room_code`),
    lifecycle_state: asEnumValue(record.lifecycle_state, ROOM_LIFECYCLE_STATES, `${label}.lifecycle_state`),
    question_index: record.question_index === null ? null : asInteger(record.question_index, `${label}.question_index`, 0),
    question_phase:
      record.question_phase === null ? null : asEnumValue(record.question_phase, QUESTION_PHASES, `${label}.question_phase`),
    question_deadline_at: asNullableIsoTimestamp(record.question_deadline_at, `${label}.question_deadline_at`),
    room_policy: parseRoomPolicy(record.room_policy, `${label}.room_policy`),
  };
}

function parseActiveQuestion(input: unknown, label: string): PlayerRoomState['active_question'] {
  if (input === null) {
    return null;
  }

  const record = asRecord(input, label);
  const displayOptions = asArray(record.display_options, `${label}.display_options`).map((item, index) => {
    const option = asRecord(item, `${label}.display_options[${index}]`);
    return {
      option_id: asTrimmedString(option.option_id, `${label}.display_options[${index}].option_id`),
      display_position: asInteger(option.display_position, `${label}.display_options[${index}].display_position`, 1),
      text: asTrimmedString(option.text, `${label}.display_options[${index}].text`),
    };
  });

  assertUnique(displayOptions.map((option) => option.display_position), `${label}.display_options.display_position`);

  return {
    question_index: asInteger(record.question_index, `${label}.question_index`, 0),
    prompt: asTrimmedString(record.prompt, `${label}.prompt`),
    question_type: asEnumValue(record.question_type, QUESTION_TYPES, `${label}.question_type`),
    display_options: displayOptions,
  };
}

export const playerRoomStateSchema = createSchema<PlayerRoomState>((input) => {
  const record = asRecord(input, 'playerRoomState');
  const sharedRoom = parseSharedRoomCore(record.shared_room, 'playerRoomState.shared_room');
  const selfRecord = asRecord(record.self, 'playerRoomState.self');
  const latestOutcomeRecord = selfRecord.latest_outcome;
  const latestOutcome: PlayerLatestOutcome | null =
    latestOutcomeRecord === null
      ? null
      : {
          is_correct: asBoolean(asRecord(latestOutcomeRecord, 'playerRoomState.self.latest_outcome').is_correct, 'playerRoomState.self.latest_outcome.is_correct'),
          awarded_points: asInteger(
            asRecord(latestOutcomeRecord, 'playerRoomState.self.latest_outcome').awarded_points,
            'playerRoomState.self.latest_outcome.awarded_points',
            0,
          ),
        };
  const leaderboard = parseLeaderboard(record.leaderboard, 'playerRoomState.leaderboard');

  assertLeaderboardPhase(sharedRoom.lifecycle_state, sharedRoom.question_phase, leaderboard, 'playerRoomState');

  return {
    shared_room: sharedRoom,
    active_question: parseActiveQuestion(record.active_question, 'playerRoomState.active_question'),
    self: {
      room_player_id: asTrimmedString(selfRecord.room_player_id, 'playerRoomState.self.room_player_id'),
      display_name: asTrimmedString(selfRecord.display_name, 'playerRoomState.self.display_name'),
      score_total: asInteger(selfRecord.score_total, 'playerRoomState.self.score_total', 0),
      correct_count: asInteger(selfRecord.correct_count, 'playerRoomState.self.correct_count', 0),
      submission_status: asEnumValue(selfRecord.submission_status, PLAYER_SUBMISSION_STATUSES, 'playerRoomState.self.submission_status'),
      latest_outcome: latestOutcome,
    },
    leaderboard,
  };
});

export const hostRoomStateSchema = createSchema<HostRoomState>((input) => {
  const record = asRecord(input, 'hostRoomState');
  const sharedRoom = parseSharedRoomCore(record.shared_room, 'hostRoomState.shared_room');
  const submissionProgress = asRecord(record.submission_progress, 'hostRoomState.submission_progress');
  const allowedActions = asArray(record.allowed_actions, 'hostRoomState.allowed_actions').map((value, index) =>
    asEnumValue(value, HOST_ALLOWED_ACTIONS, `hostRoomState.allowed_actions[${index}]`),
  );
  const leaderboard = parseLeaderboard(record.leaderboard, 'hostRoomState.leaderboard');
  const joinedPlayerCount = asInteger(record.joined_player_count, 'hostRoomState.joined_player_count', 0);
  const connectedPlayerCount = asInteger(record.connected_player_count, 'hostRoomState.connected_player_count', 0);
  const submittedPlayerCount = asInteger(
    submissionProgress.submitted_player_count,
    'hostRoomState.submission_progress.submitted_player_count',
    0,
  );
  const totalPlayerCount = asInteger(submissionProgress.total_player_count, 'hostRoomState.submission_progress.total_player_count', 0);

  assertCondition(connectedPlayerCount <= joinedPlayerCount, 'hostRoomState.connected_player_count cannot exceed joined_player_count');
  assertCondition(totalPlayerCount <= joinedPlayerCount, 'hostRoomState.submission_progress.total_player_count cannot exceed joined_player_count');
  assertCondition(
    submittedPlayerCount <= totalPlayerCount,
    'hostRoomState.submission_progress.submitted_player_count cannot exceed total_player_count',
  );
  assertUnique(allowedActions, 'hostRoomState.allowed_actions');
  assertLeaderboardPhase(sharedRoom.lifecycle_state, sharedRoom.question_phase, leaderboard, 'hostRoomState');

  return {
    shared_room: sharedRoom,
    active_question: parseActiveQuestion(record.active_question, 'hostRoomState.active_question'),
    joined_player_count: joinedPlayerCount,
    connected_player_count: connectedPlayerCount,
    submission_progress: {
      submitted_player_count: submittedPlayerCount,
      total_player_count: totalPlayerCount,
    },
    allowed_actions: allowedActions,
    leaderboard,
  };
});