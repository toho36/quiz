import type { Route } from 'next';
import Link from 'next/link';
import { submitAnswerAction } from '@/app/actions';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { getDemoAppService } from '@/lib/server/demo-app-service';
import { getDemoGuestSessionId } from '@/lib/server/demo-session';

export const dynamic = 'force-dynamic';

function getValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

type PlayParams = Promise<{ roomCode: string }>;
type PlaySearchParams = Promise<{ error?: string; notice?: string }>;

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: PlayParams;
  searchParams: PlaySearchParams;
}) {
  const [{ roomCode: rawRoomCode }, resolvedSearchParams, guestSessionId] = await Promise.all([
    params,
    searchParams,
    getDemoGuestSessionId(),
  ]);
  const roomCode = rawRoomCode.toUpperCase();
  const state = guestSessionId ? getDemoAppService().findPlayerRoomState({ guestSessionId, roomCode }) : null;
  const notice = getValue(resolvedSearchParams.notice);
  const error = getValue(resolvedSearchParams.error);

  return (
    <PageShell
      eyebrow="Play"
      title={`Player room ${roomCode}`}
      description="This route reads the current room-scoped player view from the server-owned runtime state and posts answers back through the existing gameplay logic."
    >
      {(notice || error) && (
        <SectionCard title={error ? 'Play action blocked' : 'Updated'} eyebrow={error ? 'Runtime validation' : 'Server action'}>
          <p className="text-sm text-slate-300">{error ?? notice}</p>
        </SectionCard>
      )}

      {!state ? (
        <SectionCard title="Join this room first" eyebrow="Room-scoped binding">
          <p className="text-sm text-slate-300">
            No player session is bound to {roomCode} yet. Use the join flow to create a room-scoped player identity before playing.
          </p>
          <Link className="mt-4 inline-flex text-sm font-medium text-sky-300 hover:text-sky-200" href={`/join?roomCode=${roomCode}` as Route}>
            Go to join flow →
          </Link>
        </SectionCard>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionCard title={state.self.display_name} eyebrow={`Room · ${state.shared_room.lifecycle_state}`}>
            <dl className="space-y-3 text-sm text-slate-300">
              <div>
                <dt className="text-slate-500">Phase</dt>
                <dd>{state.shared_room.question_phase ?? 'Lobby'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Score</dt>
                <dd>
                  {state.self.score_total} pts · {state.self.correct_count} correct
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Submission</dt>
                <dd>{state.self.submission_status}</dd>
              </div>
            </dl>

            {state.active_question && state.shared_room.question_phase === 'question_open' && state.self.submission_status === 'not_submitted' ? (
              <form action={submitAnswerAction} className="mt-4 space-y-3">
                <input name="roomCode" type="hidden" value={roomCode} />
                <p className="text-sm font-medium text-white">{state.active_question.prompt}</p>
                {state.active_question.display_options.map((option) => (
                  <label key={option.option_id} className="flex gap-3 rounded-2xl border border-border px-4 py-3 text-sm text-slate-300">
                    <input
                      name="selectedOptionIds"
                      type={state.active_question!.question_type === 'single_choice' ? 'radio' : 'checkbox'}
                      value={option.option_id}
                    />
                    <span>{option.text}</span>
                  </label>
                ))}
                <button className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">
                  Submit answer
                </button>
              </form>
            ) : (
              <div className="mt-4 rounded-2xl border border-border px-4 py-3 text-sm text-slate-300">
                {state.shared_room.lifecycle_state === 'lobby'
                  ? 'Waiting for the host to start the game.'
                  : state.self.latest_outcome
                    ? `Latest result: ${state.self.latest_outcome.awarded_points} pts (${state.self.latest_outcome.is_correct ? 'correct' : 'incorrect'}).`
                    : 'Waiting for the next host transition.'}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Shared room state" eyebrow="Server-authoritative">
            <p className="text-sm text-slate-300">
              Current question: {state.active_question?.prompt ?? 'No active question yet.'}
            </p>
            {state.leaderboard && (
              <ol className="mt-4 space-y-2 text-sm text-slate-300">
                {state.leaderboard.map((entry) => (
                  <li key={entry.room_player_id}>
                    #{entry.rank} {entry.display_name} · {entry.score_total} pts
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>
      )}
    </PageShell>
  );
}