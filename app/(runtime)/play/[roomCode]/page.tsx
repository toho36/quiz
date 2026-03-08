import Link from 'next/link';
import { reconnectRoomAction, submitAnswerAction } from '@/app/actions';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getAppService } from '@/lib/server/app-service';
import { getDemoGuestSessionId, getDemoPlayerBinding } from '@/lib/server/demo-session';

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
  const storedBinding = await getDemoPlayerBinding(roomCode);
  const state = guestSessionId ? getAppService().findPlayerRoomState({ guestSessionId, roomCode }) : null;
  const notice = getValue(resolvedSearchParams.notice);
  const error = getValue(resolvedSearchParams.error);

  return (
    <PageShell
      eyebrow="Play"
      title={`Player room ${roomCode}`}
      description="This route reads the current room-scoped player view from the server-owned runtime state and posts answers back through the existing gameplay logic, now with a brighter player-focused shell."
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full px-3 py-1">Room {roomCode}</Badge>
          <Badge variant="secondary" className="rounded-full bg-secondary/15 px-3 py-1 text-secondary-foreground">
            {state ? state.shared_room.lifecycle_state : 'Awaiting player binding'}
          </Badge>
        </div>
      }
      aside={
        state ? (
          <SectionCard
            title="Player pulse"
            eyebrow="Live status"
            description="Keep your score, submission status, and room phase in view while the existing gameplay logic runs."
          >
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Score</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{state.self.score_total}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Correct</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{state.self.correct_count}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Submission</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{state.self.submission_status}</p>
              </div>
            </div>
          </SectionCard>
        ) : (
          <SectionCard
            title="Before you play"
            eyebrow="Room setup"
            description="Players still need a room-scoped identity before the runtime state can load."
          >
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                Use the join flow to create or reconnect the player identity for this room.
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                Once the binding is present, this page keeps the same submit/reconnect behavior as before.
              </div>
            </div>
          </SectionCard>
        )
      }
    >
      {(notice || error) && (
        <SectionCard
          title={error ? 'Play action blocked' : 'Updated'}
          eyebrow={error ? 'Runtime validation' : 'Server action'}
          description="Gameplay flow is unchanged; this card only surfaces the latest runtime validation or server-action response."
        >
          <p className="text-sm text-muted-foreground">{error ?? notice}</p>
        </SectionCard>
      )}

      {!state ? (
        <SectionCard
          title="Join this room first"
          eyebrow="Room-scoped binding"
          description="A player binding has to exist before the server-owned room state can render here."
        >
          {storedBinding ? (
            <>
              <p className="text-sm leading-6 text-muted-foreground">
                A stored player credential was found for {roomCode}. Reconnect to resume the same room-scoped player identity with a rotated token.
              </p>
              <form action={reconnectRoomAction} className="mt-4">
                <input name="roomCode" type="hidden" value={roomCode} />
                <Button className="rounded-full px-4" type="submit">
                  Reconnect player session
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-muted-foreground">
                No player session is bound to {roomCode} yet. Use the join flow to create a room-scoped player identity before playing.
              </p>
              <div className="mt-4">
                <Button asChild className="rounded-full px-4" variant="outline">
                  <Link href={{ pathname: '/join', query: { roomCode } }}>Go to join flow</Link>
                </Button>
              </div>
            </>
          )}
        </SectionCard>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionCard
            title={state.self.display_name}
            eyebrow="Player view"
            description="This room-scoped surface still reads from the same server-owned runtime state while presenting a more polished answer flow."
            action={<Badge variant="outline" className="rounded-full px-3 py-1">{state.shared_room.lifecycle_state}</Badge>}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Phase</p>
                <p className="mt-1 text-sm font-medium text-foreground">{state.shared_room.question_phase ?? 'Lobby'}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Score</p>
                <p className="mt-1 text-sm font-medium text-foreground">{state.self.score_total} pts · {state.self.correct_count} correct</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Submission</p>
                <p className="mt-1 text-sm font-medium text-foreground">{state.self.submission_status}</p>
              </div>
            </div>

            {state.active_question && state.shared_room.question_phase === 'question_open' && state.self.submission_status === 'not_submitted' ? (
              <form action={submitAnswerAction} className="mt-5 space-y-4">
                <input name="roomCode" type="hidden" value={roomCode} />
                <div className="rounded-[1.5rem] border border-border/70 bg-background/55 px-4 py-4">
                  <p className="text-sm font-medium text-foreground">{state.active_question.prompt}</p>
                </div>
                {state.active_question.display_options.map((option) => (
                  <label key={option.option_id} className="flex gap-3 rounded-[1.5rem] border border-border/70 bg-background/50 px-4 py-3 text-sm text-foreground transition hover:border-primary/40 hover:bg-background/80">
                    <input
                      name="selectedOptionIds"
                      type={state.active_question!.question_type === 'single_choice' ? 'radio' : 'checkbox'}
                      value={option.option_id}
                    />
                    <span>{option.text}</span>
                  </label>
                ))}
                <Button className="rounded-full px-4" type="submit">
                  Submit answer
                </Button>
              </form>
            ) : (
              <div className="mt-5 rounded-[1.5rem] border border-border/70 bg-background/50 px-4 py-3 text-sm text-muted-foreground">
                {state.shared_room.lifecycle_state === 'lobby'
                  ? 'Waiting for the host to start the game.'
                  : state.self.latest_outcome
                    ? `Latest result: ${state.self.latest_outcome.awarded_points} pts (${state.self.latest_outcome.is_correct ? 'correct' : 'incorrect'}).`
                    : 'Waiting for the next host transition.'}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Shared room state"
            eyebrow="Server-authoritative"
            description="This side of the view keeps the same room-wide data and leaderboard behavior as the earlier runtime flow."
          >
            <p className="text-sm text-muted-foreground">
              Current question: {state.active_question?.prompt ?? 'No active question yet.'}
            </p>
            {state.leaderboard && (
              <ol className="mt-5 space-y-2 text-sm text-muted-foreground">
                {state.leaderboard.map((entry) => (
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