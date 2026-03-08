import Link from 'next/link';
import { hostRoomAction } from '@/app/actions';
import {
  HostProtectedGuardSurface,
  HostRuntimeReadinessSurface,
} from '@/components/protected-readiness-surfaces';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getAppOperationalReadiness, getAppService } from '@/lib/server/app-service';
import { CLERK_SIGN_IN_PATH, getProtectedAuthorState } from '@/lib/server/author-auth';
import { ensureDemoHostSessionId } from '@/lib/server/demo-session';
import { AuthorizationError } from '@/lib/server/service-errors';
import type { HostAllowedAction } from '@/lib/shared/contracts';

export const dynamic = 'force-dynamic';

const HOST_ACTION_LABELS: Record<HostAllowedAction, string> = {
  start_game: 'Start game',
  close_question: 'Close question',
  reveal: 'Reveal answer',
  show_leaderboard: 'Show leaderboard',
  next_question: 'Open next question',
  finish_game: 'Finish game',
  abort_game: 'Abort game',
};

function getValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

type HostSearchParams = Promise<{ roomCode?: string; error?: string; notice?: string }>;

export default async function HostPage({
  searchParams,
}: {
  searchParams: HostSearchParams;
}) {
  const [authorState, resolvedSearchParams] = await Promise.all([getProtectedAuthorState(), searchParams]);
  const notice = getValue(resolvedSearchParams.notice);
  const error = getValue(resolvedSearchParams.error);
  const selectedRoomCode = getValue(resolvedSearchParams.roomCode);

  if (authorState.status !== 'authenticated') {
    return <HostProtectedGuardSurface authorState={authorState} signInPath={CLERK_SIGN_IN_PATH} />;
  }

  const actor = authorState.actor;
  const hostSessionId = await ensureDemoHostSessionId();
  const readiness = getAppOperationalReadiness();
  const app = getAppService();
  const rooms = app.listActiveRooms(actor);
  let pageError = error;
  let details = null;

  if (selectedRoomCode) {
    try {
      details = app.findHostRoomDetails({
        actor,
        roomCode: selectedRoomCode,
        transportSessionId: hostSessionId,
      });
    } catch (hostError) {
      if (hostError instanceof AuthorizationError) {
        pageError ??= hostError.message;
      } else {
        throw hostError;
      }
    }
  }

  return (
    <PageShell
      eyebrow="Host"
      title="Host room"
      description="Run room lifecycle actions from the existing runtime gameplay service and share the room code with players joining the play flow, now inside a more polished control-booth layout."
      actions={
        <div className="flex flex-wrap gap-3">
          <Button asChild className="h-10 rounded-full px-4" variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Badge variant="secondary" className="rounded-full bg-secondary/15 px-3 py-1 text-secondary-foreground">
            {rooms.length} active room{rooms.length === 1 ? '' : 's'}
          </Badge>
        </div>
      }
      aside={
        <SectionCard
          title="Control booth"
          eyebrow="Runtime pulse"
          description="Keep an eye on room availability and current selection while preserving the existing host flows."
        >
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Live rooms</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{rooms.length}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Selected room</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{details?.state.shared_room.room_code ?? 'None yet'}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Bootstrap</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{readiness.canBootstrapRooms ? 'Ready' : 'Blocked'}</p>
            </div>
          </div>
        </SectionCard>
      }
    >
      {(notice || pageError) && (
        <SectionCard
          title={pageError ? 'Host action blocked' : 'Room updated'}
          eyebrow={pageError ? 'Needs attention' : 'Server action'}
          description="The host controls and lifecycle transitions are unchanged; this surface just reports the latest server response."
        >
          <p className="text-sm text-muted-foreground">{pageError ?? notice}</p>
        </SectionCard>
      )}

      {!readiness.canBootstrapRooms && <HostRuntimeReadinessSurface missingEnvKeys={readiness.runtime.missing} />}

      {!details ? (
        <SectionCard
          title="Select a room"
          eyebrow="Active rooms"
          description="Choose a live room to reveal the host controls, player counts, and room-sharing shortcuts."
          action={<Button asChild className="rounded-full px-4" variant="outline"><Link href="/dashboard">Create from dashboard</Link></Button>}
        >
          {rooms.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
              Create a host room from the dashboard to start the join and play flows.
            </div>
          ) : (
            <ul className="space-y-3 text-sm text-muted-foreground">
              {rooms.map((room) => (
                <li key={room.room_code} className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-border/80 bg-background/40 px-4 py-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{room.room_code}</p>
                      <Badge variant="outline" className="rounded-full px-3 py-1">{room.lifecycle_state}</Badge>
                    </div>
                    <p>{room.joined_player_count} player(s) connected</p>
                  </div>
                  <Button asChild className="rounded-full px-4" variant="outline">
                    <Link href={{ pathname: '/host', query: { roomCode: room.room_code } }}>Open host room</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionCard
            title={`Room ${details.state.shared_room.room_code}`}
            eyebrow="Runtime room"
            description="Use the existing host actions below to move the room through each lifecycle transition."
            action={<Badge variant="outline" className="rounded-full px-3 py-1">{details.state.shared_room.lifecycle_state}</Badge>}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Source quiz</p>
                <p className="mt-1 text-sm font-medium text-foreground">{details.bootstrap?.source_quiz_id ?? details.state.shared_room.room_id}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Current phase</p>
                <p className="mt-1 text-sm font-medium text-foreground">{details.state.shared_room.question_phase ?? 'Lobby'}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Joined players</p>
                <p className="mt-1 text-sm font-medium text-foreground">{details.state.joined_player_count}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Join flow</p>
                <div className="mt-2">
                  <Button asChild className="rounded-full px-4" variant="outline">
                    <Link
                      href={{
                        pathname: '/join',
                        query: { roomCode: details.state.shared_room.room_code },
                      }}
                    >
                      Open join flow
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
            {details.state.allowed_actions.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-3">
                {details.state.allowed_actions.map((action) => (
                  <form key={action} action={hostRoomAction}>
                    <input name="roomCode" type="hidden" value={details.state.shared_room.room_code} />
                    <input name="action" type="hidden" value={action} />
                    <Button className="rounded-full px-4" type="submit">
                      {HOST_ACTION_LABELS[action]}
                    </Button>
                  </form>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Live room view"
            eyebrow="Shared state"
            description="Monitor the player-facing runtime state while you drive the same existing lifecycle controls."
          >
            <div className="grid gap-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Submission progress</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {details.state.submission_progress.submitted_player_count} / {details.state.submission_progress.total_player_count}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Connected players</p>
                <p className="mt-1 text-sm font-medium text-foreground">{details.state.connected_player_count}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Active prompt</p>
                <p className="mt-1 text-sm font-medium text-foreground">{details.state.active_question?.prompt ?? 'Waiting for start_game'}</p>
              </div>
            </div>
            {details.state.leaderboard && (
              <ol className="mt-5 space-y-2 text-sm text-muted-foreground">
                {details.state.leaderboard.map((entry) => (
                  <li key={entry.room_player_id} className="rounded-2xl border border-border/70 bg-background/45 px-4 py-3">
                    <span className="font-medium text-foreground">#{entry.rank} {entry.display_name}</span> · {entry.score_total} pts
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