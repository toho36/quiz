import type { Route } from 'next';
import Link from 'next/link';
import { createRoomAction, publishQuizAction, signInDemoAuthorAction, signOutDemoAuthorAction } from '@/app/actions';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { getDemoAppService } from '@/lib/server/demo-app-service';
import { getDemoAuthorActor } from '@/lib/server/demo-session';

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
  const [actor, resolvedSearchParams] = await Promise.all([getDemoAuthorActor(), searchParams]);
  const notice = getValue(resolvedSearchParams.notice);
  const error = getValue(resolvedSearchParams.error);

  if (!actor) {
    return (
      <PageShell
        eyebrow="Dashboard"
        title="Author dashboard is guarded"
        description="This route stays behind a server-owned demo author session so authoring and room bootstrap actions never depend on client-only state."
      >
        <SectionCard title="Sign in to continue" eyebrow="Demo author">
          <p className="text-sm text-slate-300">Use the lightweight demo author session to reach the authoring and host flows.</p>
          <form action={signInDemoAuthorAction} className="mt-4">
            <input name="next" type="hidden" value="/dashboard" />
            <button className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">
              Continue as demo author
            </button>
          </form>
        </SectionCard>
      </PageShell>
    );
  }

  const app = getDemoAppService();
  const quizzes = app.listQuizSummaries(actor);
  const rooms = app.listActiveRooms(actor);

  return (
    <PageShell
      eyebrow="Dashboard"
      title="Author dashboard"
      description="Choose a quiz, open the authoring workspace, publish drafts, and bootstrap host rooms through the server-owned boundary."
    >
      {(notice || error) && (
        <SectionCard title={error ? 'Action blocked' : 'Ready'} eyebrow={error ? 'Needs attention' : 'Updated'}>
          <p className="text-sm text-slate-300">{error ?? notice}</p>
        </SectionCard>
      )}

      <div className="flex flex-wrap gap-3">
        <Link className="rounded-full border border-border px-4 py-2 text-sm text-slate-200" href="/authoring">
          Open authoring
        </Link>
        <form action={signOutDemoAuthorAction}>
          <button className="rounded-full border border-border px-4 py-2 text-sm text-slate-200" type="submit">
            Exit demo session
          </button>
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {quizzes.map((quiz) => (
          <SectionCard key={quiz.quiz_id} title={quiz.title} eyebrow={`Quiz · ${quiz.status}`}>
            <dl className="space-y-2 text-sm text-slate-300">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Questions</dt>
                <dd>{quiz.question_count}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Updated</dt>
                <dd>{quiz.updated_at}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link className="rounded-full border border-border px-4 py-2 text-sm text-slate-200" href={`/authoring?quizId=${quiz.quiz_id}` as Route}>
                Edit quiz
              </Link>
              {quiz.status === 'draft' ? (
                <form action={publishQuizAction}>
                  <input name="quizId" type="hidden" value={quiz.quiz_id} />
                  <button className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">
                    Publish draft
                  </button>
                </form>
              ) : (
                <form action={createRoomAction}>
                  <input name="quizId" type="hidden" value={quiz.quiz_id} />
                  <button className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">
                    Create host room
                  </button>
                </form>
              )}
            </div>
          </SectionCard>
        ))}
      </div>

      <SectionCard title="Hosted rooms" eyebrow="Runtime bootstrap">
        {rooms.length === 0 ? (
          <p className="text-sm text-slate-300">Create a room from a published quiz to open the host and join flows.</p>
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
    </PageShell>
  );
}