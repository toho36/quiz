import { afterEach, describe, expect, mock, test } from 'bun:test';
import { isValidElement, type ReactNode } from 'react';
import { resolveLocale } from '@/lib/i18n/config';

type TestElementProps = {
  children?: ReactNode;
  copy?: {
    submitLabel?: string;
  };
  eyebrow?: string;
  title?: string;
};

const MOCK_AUTHOR = { clerkUserId: 'user-1', clerkSessionId: 'session-1' };

function flattenElements(node: ReactNode): Array<React.ReactElement<TestElementProps>> {
  if (Array.isArray(node)) {
    return node.flatMap(flattenElements);
  }

  if (!isValidElement<TestElementProps>(node)) {
    return [];
  }

  return [node, ...flattenElements(node.props.children)];
}

function collectText(node: ReactNode): string[] {
  if (typeof node === 'string') {
    return [node];
  }

  if (typeof node === 'number') {
    return [String(node)];
  }

  if (Array.isArray(node)) {
    return node.flatMap(collectText);
  }

  if (!isValidElement<TestElementProps>(node)) {
    return [];
  }

  return collectText(node.props.children);
}

function mockLocaleCookie(locale?: string) {
  mock.module('next/headers', () => ({
    cookies: async () => ({
      get: () => (locale ? { value: locale } : undefined),
    }),
  }));
}

function mockServerOnly() {
  mock.module('server-only', () => ({}));
}

afterEach(() => {
  mock.restore();
});

function mockLocalizedPageModules() {
  mock.module('@/lib/server/demo-session', () => ({
    ensureDemoGuestSessionId: async () => 'guest-1',
    getDemoAuthorActor: async () => MOCK_AUTHOR,
    getDemoGuestSessionId: async () => 'guest-1',
    signInDemoAuthor: async () => {},
    signOutDemoAuthor: async () => {},
  }));
  mock.module('@/lib/server/demo-app-service', () => ({
    getDemoAppService: () => ({
      listQuizSummaries: () => [
        { quiz_id: 'quiz-1', title: 'Quiz 1', status: 'draft', question_count: 1, updated_at: '2026-03-06T12:00:00.000Z' },
      ],
      loadQuizDocument: async () => ({
        quiz: {
          quiz_id: 'quiz-1',
          owner_user_id: 'user-1',
          title: 'Quiz 1',
          description: 'Document with image controls.',
          status: 'draft',
          default_scoring_mode: 'speed_weighted',
          default_question_time_limit_seconds: 30,
          shuffle_answers_default: true,
          created_at: '2026-03-06T10:00:00.000Z',
          updated_at: '2026-03-06T10:00:00.000Z',
          published_at: null,
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
      findPlayerRoomState: () => ({
        shared_room: { room_code: 'ABCD12', lifecycle_state: 'in_progress', question_phase: 'question_open' },
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
        self: {
          display_name: 'Player One',
          score_total: 100,
          correct_count: 1,
          submission_status: 'not_submitted',
          latest_outcome: null,
        },
        leaderboard: null,
      }),
    }),
  }));
}

describe('locale foundation', () => {
  test('defaults to Czech and only honors supported English overrides', () => {
    expect(resolveLocale()).toBe('cs');
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('de')).toBe('cs');
  });

  test('join page renders Czech copy by default when no locale cookie is present', async () => {
    mockLocaleCookie();
    mockServerOnly();

    const { default: JoinPage } = await import('@/app/(runtime)/join/page');
    const page = await JoinPage({ searchParams: Promise.resolve({}) });
    expect(isValidElement(page)).toBe(true);

    const text = collectText(page.props.children).join(' ');
    const elements = flattenElements(page.props.children);

    expect(page.props.title).toBe('Vstup pro hráče');
    expect(page.props.eyebrow).toBe('Připojení');
    expect(page.props.actions.props.locale).toBe('cs');
    expect(elements.some((element) => element.props.copy?.submitLabel === 'Připojit se')).toBe(true);
    expect(text).toContain('Prostředí');
  });

  test('join page renders English copy when the locale cookie requests en', async () => {
    mockLocaleCookie('en');
    mockServerOnly();

    const { default: JoinPage } = await import('@/app/(runtime)/join/page');
    const page = await JoinPage({ searchParams: Promise.resolve({}) });
    expect(isValidElement(page)).toBe(true);

    const text = collectText(page.props.children).join(' ');
    const elements = flattenElements(page.props.children);

    expect(page.props.title).toBe('Player join entry point');
    expect(page.props.actions.props.locale).toBe('en');
    expect(page.props.actions.props.dictionary.localeNames.en).toBe('English');
    expect(elements.some((element) => element.props.copy?.submitLabel === 'Join room')).toBe(true);
    expect(text).toContain('Environment');
  });

  test('join page renders Czech error chrome by default', async () => {
    mockLocaleCookie();
    mockServerOnly();

    const { default: JoinPage } = await import('@/app/(runtime)/join/page');
    const page = await JoinPage({ searchParams: Promise.resolve({ roomCode: 'abcd12', error: 'Nepodařilo se připojit.' }) });

    const elements = flattenElements(page.props.children);
    const text = collectText(page.props.children).join(' ');

    expect(elements.some((element) => element.props.title === 'Připojení zablokováno' && element.props.eyebrow === 'Validace runtime')).toBe(true);
    expect(text).toContain('Nepodařilo se připojit.');
  });

  test('join page renders English error chrome when the locale cookie requests en', async () => {
    mockLocaleCookie('en');
    mockServerOnly();

    const { default: JoinPage } = await import('@/app/(runtime)/join/page');
    const page = await JoinPage({ searchParams: Promise.resolve({ roomCode: 'abcd12', error: 'Could not join right now.' }) });

    const elements = flattenElements(page.props.children);
    const text = collectText(page.props.children).join(' ');

    expect(elements.some((element) => element.props.title === 'Join blocked' && element.props.eyebrow === 'Runtime validation')).toBe(true);
    expect(text).toContain('Could not join right now.');
  });

  test('dashboard, authoring, host, and play pages render Czech app-shell copy by default while keeping authored content unchanged', async () => {
    mockLocaleCookie();
    mockServerOnly();
    mockLocalizedPageModules();

    const { default: DashboardPage } = await import('@/app/(workspace)/dashboard/page');
    const { default: AuthoringPage } = await import('@/app/(workspace)/authoring/page');
    const { default: HostPage } = await import('@/app/(runtime)/host/page');
    const { default: PlayPage } = await import('@/app/(runtime)/play/[roomCode]/page');

    const dashboard = await DashboardPage({ searchParams: Promise.resolve({}) });
    const authoring = await AuthoringPage({ searchParams: Promise.resolve({ quizId: 'quiz-1' }) });
    const host = await HostPage({ searchParams: Promise.resolve({ roomCode: 'ABCD12' }) });
    const play = await PlayPage({ params: Promise.resolve({ roomCode: 'abcd12' }), searchParams: Promise.resolve({}) });

    const dashboardText = collectText(dashboard.props.children).join(' ');
    const authoringText = collectText(authoring.props.children).join(' ');
    const hostText = collectText(host.props.children).join(' ');
    const playText = collectText(play.props.children).join(' ');

    expect(dashboard.props.title).toBe('Autorská nástěnka');
    expect(dashboardText).toContain('Otevřít editor');
    expect(dashboardText).toContain('Otázky');

    expect(authoring.props.title).toBe('Autorský editor');
    expect(authoringText).toContain('Uložit koncept');
    expect(authoringText).toContain('Název');
    expect(authoringText).toContain('Question with media');

    expect(host.props.title).toBe('Moderátorská místnost');
    expect(hostText).toContain('Zdrojový kvíz');
    expect(hostText).toContain('Uzavřít otázku');
    expect(hostText).toContain('Question with media');

    expect(play.props.title).toBe('Hráčská místnost ABCD12');
    expect(playText).toContain('Skóre');
    expect(playText).toContain('Odeslat odpověď');
    expect(playText).toContain('Option with media');
  });

  test('dashboard, authoring, host, and play pages render English app-shell copy when the locale cookie requests en', async () => {
    mockLocaleCookie('en');
    mockServerOnly();
    mockLocalizedPageModules();

    const { default: DashboardPage } = await import('@/app/(workspace)/dashboard/page');
    const { default: AuthoringPage } = await import('@/app/(workspace)/authoring/page');
    const { default: HostPage } = await import('@/app/(runtime)/host/page');
    const { default: PlayPage } = await import('@/app/(runtime)/play/[roomCode]/page');

    const dashboard = await DashboardPage({ searchParams: Promise.resolve({}) });
    const authoring = await AuthoringPage({ searchParams: Promise.resolve({ quizId: 'quiz-1' }) });
    const host = await HostPage({ searchParams: Promise.resolve({ roomCode: 'ABCD12' }) });
    const play = await PlayPage({ params: Promise.resolve({ roomCode: 'abcd12' }), searchParams: Promise.resolve({}) });

    const dashboardText = collectText(dashboard.props.children).join(' ');
    const authoringText = collectText(authoring.props.children).join(' ');
    const hostText = collectText(host.props.children).join(' ');
    const playText = collectText(play.props.children).join(' ');

    expect(dashboard.props.title).toBe('Author dashboard');
    expect(dashboardText).toContain('Open authoring');
    expect(dashboardText).toContain('Questions');

    expect(authoring.props.title).toBe('Authoring workspace');
    expect(authoringText).toContain('Save draft');
    expect(authoringText).toContain('Title');
    expect(authoringText).toContain('Question with media');

    expect(host.props.title).toBe('Host room');
    expect(hostText).toContain('Source quiz');
    expect(hostText).toContain('Close question');
    expect(hostText).toContain('Question with media');

    expect(play.props.title).toBe('Player room ABCD12');
    expect(playText).toContain('Score');
    expect(playText).toContain('Submit answer');
    expect(playText).toContain('Option with media');
  });

});