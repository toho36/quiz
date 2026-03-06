import type { Route } from 'next';
import Link from 'next/link';
import { hostRoomAction, signInDemoAuthorAction } from '@/app/actions';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { getDemoAppService } from '@/lib/server/demo-app-service';
import { getDemoAuthorActor } from '@/lib/server/demo-session';

export const dynamic = 'force-dynamic';

const HOST_ACTION_LABELS = {
  start_game: 'Start game',
  close_question: 'Close question',
  reveal: 'Reveal answer',
  show_leaderboard: 'Show leaderboard',
  next_question: 'Open next question',
  finish_game: 'Finish game',
  abort_game: 'Abort game',
} as const;

function getValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

type HostSearchParams = Promise<{ roomCode?: string; error?: string; notice?: string }>;

export default async function HostPage({
  searchParams,
}: {
  searchParams: HostSearchParams;
}) {
  const [actor, resolvedSearchParams] = await Promise.all([getDemoAuthorActor(), searchParams]);
  const notice = getValue(resolvedSearchParams.notice);
  const error = getValue(resolvedSearchParams.error);
  const selectedRoomCode = getValue(resolvedSearchParams.roomCode);

  if (!actor) {
    return (
      <PageShell
        eyebrow="Host"
        title="Host room access is guarded"
        description="Creating and managing runtime rooms stays tied to the server-owned author session, even in the MVP demo flow."
      >
        <SectionCard title="Sign in to host" eyebrow="Demo author">
          <form action={signInDemoAuthorAction} className="mt-2">
            <input name="next" type="hidden" value="/host" />
            <button className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">
              Continue as demo author
            </button>
          </form>
        </SectionCard>
      </PageShell>
    );
  }

  const app = getDemoAppService();
  const rooms = app.listActiveRooms(actor);
  const details = selectedRoomCode ? app.findHostRoomDetails({ actor, roomCode: selectedRoomCode }) : null;

  return (
    <PageShell
      eyebrow="Host"
      title="Host room"
      description="Run room lifecycle actions from the existing runtime gameplay service and share the room code with players joining the play flow."
    >
      {(notice || error) && (
        <SectionCard title={error ? 'Host action blocked' : 'Room updated'} eyebrow={error ? 'Needs attention' : 'Server action'}>
          <p className="text-sm text-slate-300">{error ?? notice}</p>
        </SectionCard>
      )}

      {!details ? (
        <SectionCard title="Select a room" eyebrow="Active rooms">
          {rooms.length === 0 ? (
            <p className="text-sm text-slate-300">Create a host room from the dashboard to start the join and play flows.</p>
          ) : (
            <ul className="space-y-3 text-sm text-slate-300">
              {rooms.map((room) => (
                <li key={room.room_code} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
                  <span>
                    {room.room_code} · {room.lifecycle_state} · {room.joined_player_count} player(s)
                  </span>
                  <Link className="text-sky-300 hover:text-sky-200" href={`/host?roomCode=${room.room_code}` as Route}>
                    Open host room →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionCard title={`Room ${details.state.shared_room.room_code}`} eyebrow={`Runtime · ${details.state.shared_room.lifecycle_state}`}>
            <dl className="space-y-3 text-sm text-slate-300">
              <div>
                <dt className="text-slate-500">Source quiz</dt>
                <dd>{details.bootstrap?.source_quiz_id ?? details.state.shared_room.room_id}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Current phase</dt>
                <dd>{details.state.shared_room.question_phase ?? 'Lobby'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Joined players</dt>
                <dd>{details.state.joined_player_count}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Join URL</dt>
                <dd>
                  <Link className="text-sky-300 hover:text-sky-200" href={`/join?roomCode=${details.state.shared_room.room_code}` as Route}>
                    Open join flow for {details.state.shared_room.room_code}
                  </Link>
                </dd>
              </div>
            </dl>
            {details.state.allowed_actions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3">
                {details.state.allowed_actions.map((action) => (
                  <form key={action} action={hostRoomAction}>
                    <input name="roomCode" type="hidden" value={details.state.shared_room.room_code} />
                    <input name="action" type="hidden" value={action} />
                    <button className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">
                      {HOST_ACTION_LABELS[action]}
                    </button>
                  </form>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Live room view" eyebrow="Shared state">
            <dl className="space-y-3 text-sm text-slate-300">
              <div>
                <dt className="text-slate-500">Submission progress</dt>
                <dd>
                  {details.state.submission_progress.submitted_player_count} / {details.state.submission_progress.total_player_count}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Connected players</dt>
                <dd>{details.state.connected_player_count}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Active prompt</dt>
                <dd>{details.state.active_question?.prompt ?? 'Waiting for start_game'}</dd>
              </div>
            </dl>
            {details.state.leaderboard && (
              <ol className="mt-4 space-y-2 text-sm text-slate-300">
                {details.state.leaderboard.map((entry) => (
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