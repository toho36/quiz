import Link from 'next/link';
import { createRoomAction, publishQuizAction } from '@/app/actions';
import {
  DashboardAuthoringReadinessSurface,
  DashboardProtectedGuardSurface,
  DashboardRuntimeReadinessSurface,
} from '@/components/protected-readiness-surfaces';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getAppOperationalReadiness, getAppService } from '@/lib/server/app-service';
import { CLERK_SIGN_IN_PATH, getProtectedAuthorState } from '@/lib/server/author-auth';

export const dynamic = 'force-dynamic';

function getValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

type DashboardSearchParams = Promise<{ error?: string; notice?: string }>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: DashboardSearchParams;
}) {
  const [authorState, resolvedSearchParams] = await Promise.all([getProtectedAuthorState(), searchParams]);
  const notice = getValue(resolvedSearchParams.notice);
  const error = getValue(resolvedSearchParams.error);

  if (authorState.status !== 'authenticated') {
    return <DashboardProtectedGuardSurface authorState={authorState} signInPath={CLERK_SIGN_IN_PATH} />;
  }

  const actor = authorState.actor;
  const readiness = getAppOperationalReadiness();

  if (!readiness.canLoadAuthoring) {
    return <DashboardAuthoringReadinessSurface missingEnvKeys={readiness.authoring.missingKeys} />;
  }

  const app = getAppService();
  const quizzes = await app.listQuizSummaries(actor);
  const rooms = app.listActiveRooms(actor);
  const publishedQuizCount = quizzes.filter((quiz) => quiz.status === 'published').length;

  return (
    <PageShell
      eyebrow="Dashboard"
      title="Author dashboard"
      description="Choose a quiz, open the authoring workspace, publish drafts, and bootstrap host rooms through the same server-owned boundary—now inside a brighter studio-style layout."
      actions={
        <div className="flex flex-wrap gap-3">
          <Button asChild className="h-10 rounded-full px-4" variant="outline">
            <Link href="/authoring">Open authoring</Link>
          </Button>
          <Badge variant="secondary" className="rounded-full bg-secondary/15 px-3 py-1 text-secondary-foreground">
            {quizzes.length} quiz{quizzes.length === 1 ? '' : 'zes'} ready
          </Badge>
        </div>
      }
      aside={
        <SectionCard
          title="Studio pulse"
          eyebrow="At a glance"
          description="Track your current authoring inventory before you jump into editing or room control."
        >
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Total quizzes</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{quizzes.length}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Published</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{publishedQuizCount}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Live rooms</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{rooms.length}</p>
            </div>
          </div>
        </SectionCard>
      }
    >
      {(notice || error) && (
        <SectionCard
          title={error ? 'Action blocked' : 'Ready'}
          eyebrow={error ? 'Needs attention' : 'Updated'}
          description="All dashboard behavior stays the same; this notice is just surfacing the latest server response."
        >
          <p className="text-sm text-muted-foreground">{error ?? notice}</p>
        </SectionCard>
      )}

      {!readiness.canBootstrapRooms && <DashboardRuntimeReadinessSurface missingEnvKeys={readiness.runtime.missing} />}

      <div className="grid gap-4 xl:grid-cols-2">
        {quizzes.map((quiz) => (
          <SectionCard
            key={quiz.quiz_id}
            title={quiz.title}
            eyebrow="Quiz"
            description={quiz.status === 'draft' ? 'Keep shaping the draft before you publish or host it.' : 'Published quizzes can be launched into fresh host rooms whenever you are ready.'}
            action={<Badge variant={quiz.status === 'draft' ? 'secondary' : 'outline'} className="rounded-full px-3 py-1">{quiz.status}</Badge>}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Questions</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{quiz.question_count}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Updated</p>
                <p className="mt-1 text-sm font-medium text-foreground">{quiz.updated_at}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground/70">Quiz ID</dt>
                <dd className="truncate text-right text-foreground">{quiz.quiz_id}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild className="h-10 rounded-full px-4" variant="outline">
                <Link href={{ pathname: '/authoring', query: { quizId: quiz.quiz_id } }}>Edit quiz</Link>
              </Button>
              {quiz.status === 'draft' ? (
                <form action={publishQuizAction}>
                  <input name="quizId" type="hidden" value={quiz.quiz_id} />
                  <Button className="h-10 rounded-full px-4" type="submit">
                    Publish draft
                  </Button>
                </form>
              ) : (
                <form action={createRoomAction}>
                  <input name="quizId" type="hidden" value={quiz.quiz_id} />
                  <Button className="h-10 rounded-full px-4" disabled={!readiness.canBootstrapRooms} type="submit">
                    Create host room
                  </Button>
                </form>
              )}
            </div>
          </SectionCard>
        ))}
      </div>

      <SectionCard
        title="Hosted rooms"
        eyebrow="Runtime bootstrap"
        description="Open a live room to continue into host controls or hand players the matching join code."
        action={<Badge variant="outline" className="rounded-full px-3 py-1">{rooms.length} active</Badge>}
      >
        {rooms.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
            Create a room from a published quiz to open the host and join flows.
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
                  <p>{room.joined_player_count} player(s) ready for the next host action.</p>
                </div>
                <Button asChild className="rounded-full px-4" variant="outline">
                  <Link href={{ pathname: '/host', query: { roomCode: room.room_code } }}>Open host room</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}