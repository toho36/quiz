import type { Route } from 'next';
import Link from 'next/link';
import { publishQuizAction, saveQuizDetailsAction, signInDemoAuthorAction } from '@/app/actions';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
            <Button className="h-10 rounded-full px-4" type="submit">
              Continue as demo author
            </Button>
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
          <p className="text-sm text-muted-foreground">{error ?? notice}</p>
        </SectionCard>
      )}

      <div className="flex flex-wrap gap-3">
        {quizzes.map((quiz) => (
          <Button
            key={quiz.quiz_id}
            asChild
            className="rounded-full px-4"
            variant={quiz.quiz_id === selectedQuizId ? 'default' : 'outline'}
          >
            <Link href={`/authoring?quizId=${quiz.quiz_id}` as Route}>{quiz.title}</Link>
          </Button>
        ))}
      </div>

      {document ? (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <SectionCard title={document.quiz.title} eyebrow={`Quiz · ${document.quiz.status}`}>
            <form action={saveQuizDetailsAction} className="space-y-4">
              <input name="quizId" type="hidden" value={document.quiz.quiz_id} />
              <Label className="flex-col items-start gap-2 text-sm text-muted-foreground" htmlFor="quiz-title">
                <span>Title</span>
                <Input
                  id="quiz-title"
                  className="h-11 rounded-2xl bg-background/60 px-4"
                  defaultValue={document.quiz.title}
                  name="title"
                />
              </Label>
              <Label className="flex-col items-start gap-2 text-sm text-muted-foreground" htmlFor="quiz-description">
                <span>Description</span>
                <Textarea
                  id="quiz-description"
                  className="min-h-32 rounded-2xl bg-background/60 px-4 py-3"
                  defaultValue={document.quiz.description}
                  name="description"
                />
              </Label>
              <div className="flex flex-wrap gap-3">
                <Button className="h-10 rounded-full px-4" type="submit">
                  Save draft
                </Button>
                {document.quiz.status === 'draft' && (
                  <Button className="h-10 rounded-full px-4" formAction={publishQuizAction} type="submit" variant="outline">
                    Publish quiz
                  </Button>
                )}
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Frozen runtime boundary" eyebrow="Questions">
            <ul className="space-y-3 text-sm text-muted-foreground">
              {document.questions.map((entry) => (
                <li key={entry.question.question_id} className="rounded-2xl border border-border/80 bg-background/40 px-4 py-3">
                  <p className="font-medium text-foreground">{entry.question.prompt}</p>
                  <p className="mt-1 text-muted-foreground/80">
                    {entry.question.question_type} · {entry.options.length} option(s)
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      ) : (
        <SectionCard title="No quiz available" eyebrow="Authoring">
          <p className="text-sm text-muted-foreground">Return to the dashboard to choose a seeded quiz.</p>
        </SectionCard>
      )}
    </PageShell>
  );
}