import { afterEach, describe, expect, mock, test } from 'bun:test';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { SectionNav } from '@/components/section-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type TestElementProps = {
  accept?: string;
  action?: unknown;
  alt?: string;
  children?: ReactNode;
  name?: string;
  src?: string;
  type?: string;
};

function flattenElements(node: ReactNode): Array<ReactElement<TestElementProps>> {
  if (Array.isArray(node)) {
    return node.flatMap(flattenElements);
  }

  if (!isValidElement<TestElementProps>(node)) {
    return [];
  }

  return [node, ...flattenElements(node.props.children)];
}

afterEach(() => {
  mock.restore();
});

function installAuthorActionMocks() {
  const actionStub = async () => {};
  mock.module('@/app/actions', () => ({
    createRoomAction: actionStub,
    hostRoomAction: actionStub,
    joinRoomAction: actionStub,
    addOptionAction: actionStub,
    addQuestionAction: actionStub,
    deleteOptionAction: actionStub,
    deleteQuestionAction: actionStub,
    moveOptionAction: actionStub,
    moveQuestionAction: actionStub,
    publishQuizAction: actionStub,
    reconnectRoomAction: actionStub,
    removeQuizImageAction: actionStub,
    saveQuestionAction: actionStub,
    saveQuizDetailsAction: actionStub,
    signInDemoAuthorAction: actionStub,
    submitAnswerAction: actionStub,
    uploadQuizImageAction: actionStub,
  }));
}

function installRequestCookieMock(locale: 'cs' | 'en' = 'cs') {
  mock.module('next/headers', () => ({
    cookies: async () => ({
      get: (name: string) => {
        if (name === 'quiz-locale') {
          return { value: locale };
        }

        return undefined;
      },
      set: () => {},
    }),
  }));
}

describe('shared UI slice surfaces', () => {
  test('page shell and section card are composed from shared shadcn primitives with richer supporting content', async () => {
    const [pageShellSource, sectionCardSource] = await Promise.all([
      Bun.file('components/page-shell.tsx').text(),
      Bun.file('components/section-card.tsx').text(),
    ]);

    expect(pageShellSource).toContain("import { Badge }");
    expect(pageShellSource).toContain("import { Card, CardContent }");
    expect(pageShellSource).toContain("import { Separator }");
    expect(pageShellSource).toContain('shell-panel');
    expect(sectionCardSource).toContain("import { Badge }");
    expect(sectionCardSource).toContain('CardAction');
    expect(sectionCardSource).toContain('CardDescription');
    expect(sectionCardSource).toContain('CardHeader');
    expect(sectionCardSource).toContain('CardContent');
    expect(sectionCardSource).toContain('shell-card');
  });

  test('section nav composes route pills from shared badge and button primitives', () => {
    const elements = flattenElements(
      SectionNav({
        badge: 'Workspace',
        title: 'Authoring lanes',
        description: 'Shared route navigation.',
        routes: [{ href: '/dashboard', label: 'Dashboard', description: 'Demo dashboard', section: 'workspace' }],
      }),
    );

    expect(elements.some((element) => element.type === Badge)).toBe(true);
    expect(elements.some((element) => element.type === Button)).toBe(true);
  });

  test('join room form uses shared input, label, and button primitives with the same field contract', async () => {
    installAuthorActionMocks();

    const { JoinRoomForm } = await import('@/components/join-room-form');
    const elements = flattenElements(
      JoinRoomForm({
        roomCode: 'ABCD-1234',
        copy: {
          title: 'Join room',
          eyebrow: 'Server action',
          roomCodeLabel: 'Room code',
          roomCodePlaceholder: 'ABCD-1234',
          displayNameLabel: 'Display name',
          displayNamePlaceholder: 'Player One',
          submitLabel: 'Join room',
        },
      }),
    );

    expect(elements.some((element) => element.type === Label)).toBe(true);
    expect(elements.some((element) => element.type === Input && element.props.name === 'roomCode')).toBe(true);
    expect(elements.some((element) => element.type === Input && element.props.name === 'displayName')).toBe(true);
    expect(elements.some((element) => element.type === Button && element.props.type === 'submit')).toBe(true);
  });

  test('authoring page exposes question and option image controls through the shared form primitives', async () => {
    mock.module('server-only', () => ({}));
    installRequestCookieMock();
    installAuthorActionMocks();
    mock.module('@/lib/server/author-auth', () => ({
      CLERK_SIGN_IN_PATH: '/sign-in',
      getProtectedAuthorActor: async () => ({ clerkUserId: 'user-1', clerkSessionId: 'session-1' }),
      getProtectedAuthorState: async () => ({ status: 'authenticated', actor: { clerkUserId: 'user-1', clerkSessionId: 'session-1' } }),
      requireProtectedAuthorActor: async () => ({ clerkUserId: 'user-1', clerkSessionId: 'session-1' }),
    }));
    mock.module('@/lib/server/app-service', () => ({
      getAppOperationalReadiness: () => ({
        authoring: { isConfigured: true, missingKeys: [] },
        runtime: { canCreateRooms: true, canIssueHostClaims: true, missing: [] },
        canLoadAuthoring: true,
        canBootstrapRooms: true,
      }),
      getAppService: () => ({
        listQuizSummaries: () => [{ quiz_id: 'quiz-1', title: 'Quiz 1', status: 'published', question_count: 1, updated_at: '2026-03-06T12:00:00.000Z' }],
        loadQuizDocument: async () => ({
          quiz: {
            quiz_id: 'quiz-1',
            owner_user_id: 'user-1',
            title: 'Quiz 1',
            description: 'Document with image controls.',
            status: 'published',
            default_scoring_mode: 'speed_weighted',
            default_question_time_limit_seconds: 30,
            shuffle_answers_default: true,
            created_at: '2026-03-06T10:00:00.000Z',
            updated_at: '2026-03-06T10:00:00.000Z',
            published_at: '2026-03-06T10:05:00.000Z',
          },
          questions: [
            {
              question: {
                question_id: 'question-1',
                quiz_id: 'quiz-1',
                position: 1,
                prompt: 'Question with media',
                image: {
                  storage_provider: 'cloudflare_r2',
                  object_key: 'quiz-images/quiz-1/questions/question-1/current.png',
                  content_type: 'image/png',
                  bytes: 68,
                  width: 1,
                  height: 1,
                },
                question_type: 'single_choice',
                evaluation_policy: 'exact_match',
                base_points: 100,
                time_limit_seconds: 20,
                shuffle_answers: true,
                created_at: '2026-03-06T10:00:00.000Z',
                updated_at: '2026-03-06T10:00:00.000Z',
              },
              options: [
                {
                  option_id: 'option-1',
                  question_id: 'question-1',
                  position: 1,
                  text: 'Option with media',
                  image: {
                    storage_provider: 'cloudflare_r2',
                    object_key: 'quiz-images/quiz-1/questions/question-1/options/option-1/current.png',
                    content_type: 'image/png',
                    bytes: 68,
                    width: 1,
                    height: 1,
                  },
                  is_correct: true,
                },
              ],
            },
          ],
        }),
      }),
    }));

    const { default: AuthoringPage } = await import('@/app/(workspace)/authoring/page');
    const elements = flattenElements(await AuthoringPage({ searchParams: Promise.resolve({ quizId: 'quiz-1' }) }));

    expect(elements.filter((element) => element.type === Input && element.props.type === 'file' && element.props.name === 'image').length).toBe(2);
    expect(elements.some((element) => element.type === Input && element.props.accept?.includes('image/png'))).toBe(true);
    expect(elements.some((element) => element.type === 'img' && typeof element.props.alt === 'string' && ['Náhled otázky', 'Question preview'].includes(element.props.alt))).toBe(true);
    expect(elements.some((element) => element.type === 'img' && typeof element.props.alt === 'string' && ['Náhled možnosti', 'Option preview'].includes(element.props.alt))).toBe(true);
    expect(elements.some((element) => ['button', Button].includes(element.type as never) && ['Odstranit obrázek otázky', 'Remove question image'].includes(String(element.props.children)))).toBe(true);
    expect(elements.some((element) => ['button', Button].includes(element.type as never) && ['Odstranit obrázek možnosti', 'Remove option image'].includes(String(element.props.children)))).toBe(true);
  });

  test('host page renders runtime question and option images when the active room state includes them', async () => {
    mock.module('server-only', () => ({}));
    installRequestCookieMock();
    installAuthorActionMocks();
    mock.module('@/lib/server/author-auth', () => ({
      CLERK_SIGN_IN_PATH: '/sign-in',
      getProtectedAuthorActor: async () => ({ clerkUserId: 'user-1', clerkSessionId: 'session-1' }),
      getProtectedAuthorState: async () => ({ status: 'authenticated', actor: { clerkUserId: 'user-1', clerkSessionId: 'session-1' } }),
      requireProtectedAuthorActor: async () => ({ clerkUserId: 'user-1', clerkSessionId: 'session-1' }),
    }));
    mock.module('@/lib/server/demo-session', () => ({
      ensureDemoHostSessionId: async () => 'host-1',
      ensureDemoGuestSessionId: async () => 'guest-1',
      getDemoGuestSessionId: async () => 'guest-1',
      getDemoPlayerBinding: async () => null,
      setDemoPlayerBinding: async () => {},
      clearDemoPlayerBinding: async () => {},
    }));
    mock.module('@/lib/server/app-service', () => ({
      getAppOperationalReadiness: () => ({
        authoring: { isConfigured: true, missingKeys: [] },
        runtime: { canCreateRooms: true, canIssueHostClaims: true, missing: [] },
        canLoadAuthoring: true,
        canBootstrapRooms: true,
      }),
      getAppService: () => ({
        listActiveRooms: () => [{ room_code: 'ABCD12', lifecycle_state: 'in_progress', joined_player_count: 1 }],
        findHostRoomDetails: () => ({
          bootstrap: { source_quiz_id: 'quiz-1' },
          state: {
            shared_room: { room_code: 'ABCD12', room_id: 'room-1', lifecycle_state: 'in_progress', question_phase: 'question_open' },
            active_question: {
              question_index: 0,
              prompt: 'Question with media',
              image: {
                storage_provider: 'cloudflare_r2',
                object_key: 'quiz-images/quiz-1/questions/question-1/current.png',
                content_type: 'image/png',
                bytes: 68,
                width: 1,
                height: 1,
              },
              question_type: 'single_choice',
              display_options: [
                {
                  option_id: 'option-1',
                  display_position: 1,
                  text: 'Option with media',
                  image: {
                    storage_provider: 'cloudflare_r2',
                    object_key: 'quiz-images/quiz-1/questions/question-1/options/option-1/current.png',
                    content_type: 'image/png',
                    bytes: 68,
                    width: 1,
                    height: 1,
                  },
                },
              ],
            },
            joined_player_count: 1,
            connected_player_count: 1,
            submission_progress: { submitted_player_count: 0, total_player_count: 1 },
            allowed_actions: ['close_question'],
            leaderboard: null,
          },
        }),
      }),
    }));

    const { default: HostPage } = await import('@/app/(runtime)/host/page');
    const elements = flattenElements(await HostPage({ searchParams: Promise.resolve({ roomCode: 'ABCD12' }) }));

    expect(elements.some((element) => element.type === 'img' && typeof element.props.alt === 'string' && ['Obrázek otázky', 'Question image'].includes(element.props.alt))).toBe(true);
    expect(elements.some((element) => element.type === 'img' && typeof element.props.alt === 'string' && ['Obrázek možnosti 1', 'Option image 1'].includes(element.props.alt))).toBe(true);
    expect(elements.some((element) => element.type === 'img' && element.props.src?.includes('viewer=host'))).toBe(true);
  });

  test('host page stays text-only when the active question has no images', async () => {
    mock.module('server-only', () => ({}));
    installRequestCookieMock();
    installAuthorActionMocks();
    mock.module('@/lib/server/author-auth', () => ({
      CLERK_SIGN_IN_PATH: '/sign-in',
      getProtectedAuthorActor: async () => ({ clerkUserId: 'user-1', clerkSessionId: 'session-1' }),
      getProtectedAuthorState: async () => ({ status: 'authenticated', actor: { clerkUserId: 'user-1', clerkSessionId: 'session-1' } }),
      requireProtectedAuthorActor: async () => ({ clerkUserId: 'user-1', clerkSessionId: 'session-1' }),
    }));
    mock.module('@/lib/server/demo-session', () => ({
      ensureDemoHostSessionId: async () => 'host-1',
      ensureDemoGuestSessionId: async () => 'guest-1',
      getDemoGuestSessionId: async () => 'guest-1',
      getDemoPlayerBinding: async () => null,
      setDemoPlayerBinding: async () => {},
      clearDemoPlayerBinding: async () => {},
    }));
    mock.module('@/lib/server/app-service', () => ({
      getAppOperationalReadiness: () => ({
        authoring: { isConfigured: true, missingKeys: [] },
        runtime: { canCreateRooms: true, canIssueHostClaims: true, missing: [] },
        canLoadAuthoring: true,
        canBootstrapRooms: true,
      }),
      getAppService: () => ({
        listActiveRooms: () => [{ room_code: 'ABCD12', lifecycle_state: 'in_progress', joined_player_count: 1 }],
        findHostRoomDetails: () => ({
          bootstrap: { source_quiz_id: 'quiz-1' },
          state: {
            shared_room: { room_code: 'ABCD12', room_id: 'room-1', lifecycle_state: 'in_progress', question_phase: 'question_open' },
            active_question: {
              question_index: 0,
              prompt: 'Text-only host question',
              question_type: 'single_choice',
              display_options: [{ option_id: 'option-1', display_position: 1, text: 'Plain option' }],
            },
            joined_player_count: 1,
            connected_player_count: 1,
            submission_progress: { submitted_player_count: 0, total_player_count: 1 },
            allowed_actions: ['close_question'],
            leaderboard: null,
          },
        }),
      }),
    }));

    const { default: HostPage } = await import('@/app/(runtime)/host/page');
    const elements = flattenElements(await HostPage({ searchParams: Promise.resolve({ roomCode: 'ABCD12' }) }));

    expect(elements.some((element) => element.type === 'img')).toBe(false);
  });

  test('play page renders runtime question and option images when present', async () => {
    mock.module('server-only', () => ({}));
    installRequestCookieMock();
    installAuthorActionMocks();
    mock.module('@/lib/server/demo-session', () => ({
      ensureDemoGuestSessionId: async () => 'guest-1',
      ensureDemoHostSessionId: async () => 'host-1',
      getDemoGuestSessionId: async () => 'guest-1',
      getDemoPlayerBinding: async () => null,
      setDemoPlayerBinding: async () => {},
      clearDemoPlayerBinding: async () => {},
    }));
    mock.module('@/lib/server/app-service', () => ({
      getAppService: () => ({
        findPlayerRoomState: () => ({
          shared_room: { room_code: 'ABCD12', lifecycle_state: 'in_progress', question_phase: 'question_open' },
          active_question: {
            question_index: 0,
            prompt: 'Player question with media',
            image: {
              storage_provider: 'cloudflare_r2',
              object_key: 'quiz-images/quiz-1/questions/question-1/current.png',
              content_type: 'image/png',
              bytes: 68,
              width: 1,
              height: 1,
            },
            question_type: 'single_choice',
            display_options: [
              {
                option_id: 'option-1',
                display_position: 1,
                text: 'Option with media',
                image: {
                  storage_provider: 'cloudflare_r2',
                  object_key: 'quiz-images/quiz-1/questions/question-1/options/option-1/current.png',
                  content_type: 'image/png',
                  bytes: 68,
                  width: 1,
                  height: 1,
                },
              },
            ],
          },
          self: {
            display_name: 'Player One',
            score_total: 0,
            correct_count: 0,
            submission_status: 'not_submitted',
            latest_outcome: null,
          },
          leaderboard: null,
        }),
      }),
    }));

    const { default: PlayPage } = await import('@/app/(runtime)/play/[roomCode]/page');
    const elements = flattenElements(await PlayPage({ params: Promise.resolve({ roomCode: 'abcd12' }), searchParams: Promise.resolve({}) }));

    expect(elements.some((element) => element.type === 'img' && typeof element.props.alt === 'string' && ['Obrázek otázky', 'Question image'].includes(element.props.alt))).toBe(true);
    expect(elements.some((element) => element.type === 'img' && typeof element.props.alt === 'string' && ['Obrázek možnosti 1', 'Option image 1'].includes(element.props.alt))).toBe(true);
    expect(elements.some((element) => element.type === 'img' && element.props.src?.includes('viewer=player'))).toBe(true);
  });

  test('play page stays text-only when the active question has no images', async () => {
    mock.module('server-only', () => ({}));
    installRequestCookieMock();
    installAuthorActionMocks();
    mock.module('@/lib/server/demo-session', () => ({
      ensureDemoGuestSessionId: async () => 'guest-1',
      ensureDemoHostSessionId: async () => 'host-1',
      getDemoGuestSessionId: async () => 'guest-1',
      getDemoPlayerBinding: async () => null,
      setDemoPlayerBinding: async () => {},
      clearDemoPlayerBinding: async () => {},
    }));
    mock.module('@/lib/server/app-service', () => ({
      getAppService: () => ({
        findPlayerRoomState: () => ({
          shared_room: { room_code: 'ABCD12', lifecycle_state: 'in_progress', question_phase: 'question_open' },
          active_question: {
            question_index: 0,
            prompt: 'Text-only player question',
            question_type: 'single_choice',
            display_options: [{ option_id: 'option-1', display_position: 1, text: 'Plain option' }],
          },
          self: {
            display_name: 'Player One',
            score_total: 0,
            correct_count: 0,
            submission_status: 'not_submitted',
            latest_outcome: null,
          },
          leaderboard: null,
        }),
      }),
    }));

    const { default: PlayPage } = await import('@/app/(runtime)/play/[roomCode]/page');
    const elements = flattenElements(await PlayPage({ params: Promise.resolve({ roomCode: 'abcd12' }), searchParams: Promise.resolve({}) }));

    expect(elements.some((element) => element.type === 'img')).toBe(false);
  });
});