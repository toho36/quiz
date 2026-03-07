import Link from 'next/link';
import { createRoomAction, publishQuizAction } from '@/app/actions';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { CLERK_SIGN_IN_PATH, getProtectedAuthorState } from '@/lib/server/author-auth';
import { getDemoAppService } from '@/lib/server/demo-app-service';

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
    return (
      <PageShell
        eyebrow="Dashboard"
        title="Author dashboard is guarded"
        description="This route now expects Clerk-backed server auth before protected authoring or runtime bootstrap actions can run."
      >
        <SectionCard title="Clerk integration required" eyebrow="Protected author flow">
          <p className="text-sm text-muted-foreground">
            {authorState.status === 'setup-required' ? authorState.message : 'Sign in with Clerk to continue.'}
          </p>
          {authorState.status === 'unauthenticated' ? (
            <div className="mt-4">
              <Button asChild className="h-10 rounded-full px-4">
                <Link href={CLERK_SIGN_IN_PATH}>Open sign-in</Link>
              </Button>
            </div>
          ) : null}
          {authorState.status === 'setup-required' && authorState.missingEnvKeys.length > 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Missing env: {authorState.missingEnvKeys.join(', ')}</p>
          ) : null}
        </SectionCard>
      </PageShell>
    );
  }

  const actor = authorState.actor;
  const app = getDemoAppService();
  const quizzes = await app.listQuizSummaries(actor);
  const rooms = app.listActiveRooms(actor);

  return (
    <PageShell
      eyebrow="Dashboard"
      title="Author dashboard"
      description="Choose a quiz, open the authoring workspace, publish drafts, and bootstrap host rooms through the server-owned boundary."
    >
      {(notice || error) && (
        <SectionCard title={error ? 'Action blocked' : 'Ready'} eyebrow={error ? 'Needs attention' : 'Updated'}>
          <p className="text-sm text-muted-foreground">{error ?? notice}</p>
        </SectionCard>
      )}

      <div className="flex flex-wrap gap-3">
        <Button asChild className="h-10 rounded-full px-4" variant="outline">
          <Link href="/authoring">Open authoring</Link>
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {quizzes.map((quiz) => (
          <SectionCard key={quiz.quiz_id} title={quiz.title} eyebrow={`Quiz · ${quiz.status}`}>
            <dl className="space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground/70">Questions</dt>
                <dd>{quiz.question_count}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground/70">Updated</dt>
                <dd>{quiz.updated_at}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-3">
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
                  <Button className="h-10 rounded-full px-4" type="submit">
                    Create host room
                  </Button>
                </form>
              )}
            </div>
          </SectionCard>
        ))}
      </div>

      <SectionCard title="Hosted rooms" eyebrow="Runtime bootstrap">
        {rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a room from a published quiz to open the host and join flows.</p>
        ) : (
          <ul className="space-y-3 text-sm text-muted-foreground">
            {rooms.map((room) => (
              <li key={room.room_code} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-background/40 px-4 py-3">
                <span>
                  {room.room_code} · {room.lifecycle_state} · {room.joined_player_count} player(s)
                </span>
                <Button asChild className="h-auto px-0 text-sky-200" variant="link">
                  <Link href={{ pathname: '/host', query: { roomCode: room.room_code } }}>Open host room →</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}