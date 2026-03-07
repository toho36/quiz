export const publishedQuizDocumentFixture = {
  quiz: {
    quiz_id: 'quiz-1',
    owner_user_id: 'user-1',
    title: 'MVP Quiz',
    description: 'A published quiz fixture.',
    status: 'published',
    default_scoring_mode: 'speed_weighted',
    default_question_time_limit_seconds: 30,
    shuffle_answers_default: true,
    created_at: '2026-03-06T10:00:00.000Z',
    updated_at: '2026-03-06T10:00:00.000Z',
    published_at: '2026-03-06T10:00:00.000Z',
  },
  questions: [
    {
      question: {
        question_id: 'question-1',
        quiz_id: 'quiz-1',
        position: 1,
        prompt: 'What is 2 + 2?',
        question_type: 'single_choice',
        evaluation_policy: 'exact_match',
        base_points: 100,
        time_limit_seconds: 20,
        shuffle_answers: true,
        created_at: '2026-03-06T10:00:00.000Z',
        updated_at: '2026-03-06T10:00:00.000Z',
      },
      options: [
        { option_id: 'option-1', question_id: 'question-1', position: 1, text: '4', is_correct: true },
        { option_id: 'option-2', question_id: 'question-1', position: 2, text: '5', is_correct: false },
      ],
    },
    {
      question: {
        question_id: 'question-2',
        quiz_id: 'quiz-1',
        position: 2,
        prompt: 'Select prime numbers.',
        question_type: 'multiple_choice',
        evaluation_policy: 'exact_match',
        base_points: 200,
        time_limit_seconds: 25,
        shuffle_answers: false,
        created_at: '2026-03-06T10:00:00.000Z',
        updated_at: '2026-03-06T10:00:00.000Z',
      },
      options: [
        { option_id: 'option-3', question_id: 'question-2', position: 1, text: '2', is_correct: true },
        { option_id: 'option-4', question_id: 'question-2', position: 2, text: '3', is_correct: true },
        { option_id: 'option-5', question_id: 'question-2', position: 3, text: '4', is_correct: false },
      ],
    },
  ],
} as const;

export const createRoomResponseFixture = {
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
  host_claim_expires_at: '2026-03-06T10:01:00.000Z',
} as const;

export const hostClaimTokenClaimsFixture = {
  purpose: 'host_claim',
  room_id: 'room-1',
  clerk_user_id: 'user-1',
  clerk_session_id: 'session-1',
  jti: 'claim-1',
  iat: 1_700_000_000,
  exp: 1_700_000_060,
  v: 1,
} as const;

export const hostClaimCommandFixture = {
  room_id: 'room-1',
  host_claim_token: 'signed-host-claim',
  transport_session_id: 'transport-1',
} as const;

export const playerJoinCommandFixture = {
  room_code: 'ABCD12',
  display_name: 'Player One',
  client_join_request_id: 'join-1',
} as const;

export const playerReconnectCommandFixture = {
  room_id: 'room-1',
  room_player_id: 'player-1',
  resume_token: 'resume-token',
} as const;

export const answerSubmissionCommandFixture = {
  room_id: 'room-1',
  question_index: 0,
  selected_option_ids: ['option-1'],
  client_request_id: 'submission-1',
} as const;

export const runtimeRoomFixture = {
  room_id: 'room-1',
  room_code: 'ABCD12',
  source_quiz_id: 'quiz-1',
  lifecycle_state: 'in_progress',
  current_question_index: 0,
  host_binding: { clerk_user_id: 'user-1', host_binding_version: 1 },
  created_at: '2026-03-06T10:00:00.000Z',
  started_at: '2026-03-06T10:00:10.000Z',
  ended_at: null,
  expires_at: '2026-03-06T12:00:10.000Z',
  room_policy: {
    scoring_mode: 'speed_weighted',
    question_time_limit_seconds: 30,
    shuffle_answers: true,
    late_join_allowed: false,
  },
} as const;

export const runtimeRoomPlayerFixture = {
  room_player_id: 'player-1',
  room_id: 'room-1',
  display_name: 'Player One',
  status: 'connected',
  resume_token_hash: 'hash',
  resume_version: 1,
  resume_expires_at: '2026-03-06T22:00:05.000Z',
  joined_at: '2026-03-06T10:00:05.000Z',
  last_seen_at: '2026-03-06T10:00:20.000Z',
  score_total: 100,
  correct_count: 1,
  join_order: 1,
} as const;

export const runtimeQuestionSnapshotFixture = {
  room_id: 'room-1',
  question_index: 0,
  source_question_id: 'question-1',
  prompt: 'What is 2 + 2?',
  question_type: 'single_choice',
  evaluation_policy: 'exact_match',
  base_points: 100,
  effective_time_limit_seconds: 20,
  shuffle_answers: true,
} as const;

export const runtimeQuestionOptionSnapshotFixture = {
  room_id: 'room-1',
  question_index: 0,
  source_option_id: 'option-1',
  author_position: 1,
  display_position: 2,
  text: '4',
  is_correct: true,
} as const;

export const runtimeQuestionStateFixture = {
  room_id: 'room-1',
  question_index: 0,
  phase: 'question_open',
  opened_at: '2026-03-06T10:00:10.000Z',
  deadline_at: '2026-03-06T10:00:30.000Z',
  closed_at: null,
  revealed_at: null,
  leaderboard_shown_at: null,
} as const;

export const answerSubmissionRecordFixture = {
  room_id: 'room-1',
  question_index: 0,
  room_player_id: 'player-1',
  accepted_at: '2026-03-06T10:00:15.000Z',
  is_correct: true,
  awarded_points: 100,
  submission_status: 'accepted',
} as const;

export const answerSelectionFixture = {
  room_id: 'room-1',
  question_index: 0,
  room_player_id: 'player-1',
  source_option_id: 'option-1',
} as const;

export const playerRoomStateFixture = {
  shared_room: {
    room_id: 'room-1',
    room_code: 'ABCD12',
    lifecycle_state: 'in_progress',
    question_index: 0,
    question_phase: 'question_open',
    question_deadline_at: '2026-03-06T10:00:30.000Z',
    room_policy: {
      scoring_mode: 'speed_weighted',
      question_time_limit_seconds: 30,
      shuffle_answers: true,
      late_join_allowed: false,
    },
  },
  active_question: {
    question_index: 0,
    prompt: 'What is 2 + 2?',
    question_type: 'single_choice',
    display_options: [
      { option_id: 'option-2', display_position: 1, text: '5' },
      { option_id: 'option-1', display_position: 2, text: '4' },
    ],
  },
  self: {
    room_player_id: 'player-1',
    display_name: 'Player One',
    score_total: 100,
    correct_count: 1,
    submission_status: 'submitted',
    latest_outcome: null,
  },
  leaderboard: null,
} as const;

export const hostRoomStateFixture = {
  shared_room: playerRoomStateFixture.shared_room,
  active_question: playerRoomStateFixture.active_question,
  joined_player_count: 3,
  connected_player_count: 2,
  submission_progress: {
    submitted_player_count: 1,
    total_player_count: 3,
  },
  allowed_actions: ['close_question', 'abort_game'],
  leaderboard: null,
} as const;