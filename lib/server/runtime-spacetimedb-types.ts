import { t } from 'spacetimedb';

export type SpacetimeRuntimeRoomPolicy = {
  scoring_mode: string;
  question_time_limit_seconds: number;
  shuffle_answers: boolean;
  late_join_allowed: boolean;
};

export type SpacetimeRuntimeRoom = {
  room_id: string;
  room_code: string;
  source_quiz_id: string;
  lifecycle_state: string;
  current_question_index: number | undefined;
  host_binding: {
    clerk_user_id: string;
    host_binding_version: number;
  };
  created_at: string;
  started_at: string | undefined;
  ended_at: string | undefined;
  expires_at: string;
  room_policy: SpacetimeRuntimeRoomPolicy;
};

export type SpacetimeRuntimeQuestionSnapshot = {
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

export type SpacetimeRuntimeQuestionOptionSnapshot = {
  room_id: string;
  question_index: number;
  source_option_id: string;
  author_position: number;
  display_position: number;
  text: string;
  is_correct: boolean;
};

export type SpacetimeRuntimeBootstrapPayload = {
  room: SpacetimeRuntimeRoom;
  question_snapshots: SpacetimeRuntimeQuestionSnapshot[];
  option_snapshots: SpacetimeRuntimeQuestionOptionSnapshot[];
};

const runtimeRoomPolicyType = t.object('RuntimeRoomPolicy', {
  scoring_mode: t.string(),
  question_time_limit_seconds: t.u32(),
  shuffle_answers: t.bool(),
  late_join_allowed: t.bool(),
});

const runtimeRoomType = t.object('RuntimeRoom', {
  room_id: t.string(),
  room_code: t.string(),
  source_quiz_id: t.string(),
  lifecycle_state: t.string(),
  current_question_index: t.option(t.u32()),
  host_binding: t.object('RuntimeRoomHostBinding', {
    clerk_user_id: t.string(),
    host_binding_version: t.u32(),
  }),
  created_at: t.string(),
  started_at: t.option(t.string()),
  ended_at: t.option(t.string()),
  expires_at: t.string(),
  room_policy: runtimeRoomPolicyType,
});

const runtimeQuestionSnapshotType = t.object('RuntimeQuestionSnapshot', {
  room_id: t.string(),
  question_index: t.u32(),
  source_question_id: t.string(),
  prompt: t.string(),
  question_type: t.string(),
  evaluation_policy: t.string(),
  base_points: t.u32(),
  effective_time_limit_seconds: t.option(t.u32()),
  shuffle_answers: t.bool(),
});

const runtimeQuestionOptionSnapshotType = t.object('RuntimeQuestionOptionSnapshot', {
  room_id: t.string(),
  question_index: t.u32(),
  source_option_id: t.string(),
  author_position: t.u32(),
  display_position: t.u32(),
  text: t.string(),
  is_correct: t.bool(),
});

export const runtimeBootstrapPayloadType = t.object('RuntimeBootstrapPayload', {
  room: runtimeRoomType,
  question_snapshots: t.array(runtimeQuestionSnapshotType),
  option_snapshots: t.array(runtimeQuestionOptionSnapshotType),
});