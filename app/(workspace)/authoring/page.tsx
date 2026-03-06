import type { Route } from 'next';
import Link from 'next/link';
import { publishQuizAction, saveQuizDetailsAction, signInDemoAuthorAction } from '@/app/actions';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { getDemoAppService } from '@/lib/server/demo-app-service';
import { getDemoAuthorActor } from '@/lib/server/demo-session';

export const dynamic = 'force-dynamic';

function getValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

type AuthoringSearchParams = Promise<{ quizId?: string; error?: string; notice?: string }>;

export default async function AuthoringPage({
  searchParams,
}: {
  searchParams: AuthoringSearchParams;
}) {
  const [actor, resolvedSearchParams] = await Promise.all([getDemoAuthorActor(), searchParams]);
  const notice = getValue(resolvedSearchParams.notice);
  const error = getValue(resolvedSearchParams.error);

  if (!actor) {
    return (
      <PageShell
        eyebrow="Authoring"
        title="Authoring requires the demo author session"
        description="Quiz edits and publish actions stay on the Next.js server boundary, so this workspace remains guarded even in the demo flow."
      >
        <SectionCard title="Sign in to edit quizzes" eyebrow="Guard">
          <form action={signInDemoAuthorAction} className="mt-2">
            <input name="next" type="hidden" value="/authoring" />
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
  const selectedQuizId = getValue(resolvedSearchParams.quizId) ?? quizzes[0]?.quiz_id;
  const document = selectedQuizId ? await app.loadQuizDocument({ actor, quizId: selectedQuizId }) : null;

  return (
    <PageShell
      eyebrow="Authoring"
      title="Authoring workspace"
      description="Edit the current quiz metadata, keep draft/publish transitions explicit, and leave runtime room state to the host flow."
    >
      {(notice || error) && (
        <SectionCard title={error ? 'Save blocked' : 'Updated'} eyebrow={error ? 'Validation' : 'Server action'}>
          <p className="text-sm text-slate-300">{error ?? notice}</p>
        </SectionCard>
      )}

      <div className="flex flex-wrap gap-3">
        {quizzes.map((quiz) => (
          <Link
            key={quiz.quiz_id}
            className={`rounded-full border px-4 py-2 text-sm ${quiz.quiz_id === selectedQuizId ? 'border-sky-400 text-white' : 'border-border text-slate-300'}`}
            href={`/authoring?quizId=${quiz.quiz_id}` as Route}
          >
            {quiz.title}
          </Link>
        ))}
      </div>

      {document ? (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <SectionCard title={document.quiz.title} eyebrow={`Quiz · ${document.quiz.status}`}>
            <form action={saveQuizDetailsAction} className="space-y-4">
              <input name="quizId" type="hidden" value={document.quiz.quiz_id} />
              <label className="block space-y-2 text-sm text-slate-300">
                <span>Title</span>
                <input
                  className="w-full rounded-2xl border border-border bg-slate-950 px-4 py-3 text-white"
                  defaultValue={document.quiz.title}
                  name="title"
                />
              </label>
              <label className="block space-y-2 text-sm text-slate-300">
                <span>Description</span>
                <textarea
                  className="min-h-32 w-full rounded-2xl border border-border bg-slate-950 px-4 py-3 text-white"
                  defaultValue={document.quiz.description}
                  name="description"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">
                  Save draft
                </button>
                {document.quiz.status === 'draft' && (
                  <button className="rounded-full border border-border px-4 py-2 text-sm text-slate-200" formAction={publishQuizAction} type="submit">
                    Publish quiz
                  </button>
                )}
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Frozen runtime boundary" eyebrow="Questions">
            <ul className="space-y-3 text-sm text-slate-300">
              {document.questions.map((entry) => (
                <li key={entry.question.question_id} className="rounded-2xl border border-border px-4 py-3">
                  <p className="font-medium text-white">{entry.question.prompt}</p>
                  <p className="mt-1 text-slate-400">
                    {entry.question.question_type} · {entry.options.length} option(s)
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      ) : (
        <SectionCard title="No quiz available" eyebrow="Authoring">
          <p className="text-sm text-slate-300">Return to the dashboard to choose a seeded quiz.</p>
        </SectionCard>
      )}
    </PageShell>
  );
}