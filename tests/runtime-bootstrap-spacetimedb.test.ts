/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { createSpacetimeRuntimeBootstrapProvisioner } from '@/lib/server/runtime-spacetimedb-bootstrap';

describe('SpacetimeDB runtime bootstrap adapter', () => {
  test('parses a bootstrap_room payload into shared runtime snapshots and disconnects the client', async () => {
    let disconnected = false;
    const provisioner = createSpacetimeRuntimeBootstrapProvisioner({
      clientFactory: async () => ({
        procedures: {
          async bootstrapRoom() {
            return {
              room: {
                room_id: 'room-live-1',
                room_code: 'ABCD12',
                source_quiz_id: 'quiz-1',
                lifecycle_state: 'lobby',
                current_question_index: undefined,
                host_binding: { clerk_user_id: 'user-1', host_binding_version: 1 },
                created_at: '2026-03-07T14:00:00.000Z',
                started_at: undefined,
                ended_at: undefined,
                expires_at: '2026-03-07T16:00:00.000Z',
                room_policy: {
                  scoring_mode: 'speed_weighted',
                  question_time_limit_seconds: 30,
                  shuffle_answers: true,
                  late_join_allowed: false,
                },
              },
              question_snapshots: [
                {
                  room_id: 'room-live-1',
                  question_index: 0,
                  source_question_id: 'question-1',
                  prompt: 'What is 2 + 2?',
                  question_type: 'single_choice',
                  evaluation_policy: 'exact_match',
                  base_points: 100,
                  effective_time_limit_seconds: undefined,
                  shuffle_answers: true,
                },
              ],
              option_snapshots: [
                {
                  room_id: 'room-live-1',
                  question_index: 0,
                  source_option_id: 'option-1',
                  author_position: 1,
                  display_position: 2,
                  text: '4',
                  is_correct: true,
                },
              ],
            };
          },
        },
        disconnect() {
          disconnected = true;
        },
      }),
    });

    const result = await provisioner.createRoom({
      sourceQuizId: 'quiz-1',
      ownerUserId: 'user-1',
      roomPolicy: {
        scoring_mode: 'speed_weighted',
        question_time_limit_seconds: 30,
        shuffle_answers: true,
        late_join_allowed: false,
      },
    });

    expect(result.room.current_question_index).toBeNull();
    expect(result.room.started_at).toBeNull();
    expect(result.questionSnapshots[0]?.effective_time_limit_seconds).toBeNull();
    expect(result.optionSnapshots[0]?.display_position).toBe(2);
    expect(disconnected).toBe(true);
  });
});