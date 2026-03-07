import Link from 'next/link';
import { publishQuizAction, saveQuizDetailsAction } from '@/app/actions';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CLERK_SIGN_IN_PATH, getProtectedAuthorState } from '@/lib/server/author-auth';
import { getDemoAppService } from '@/lib/server/demo-app-service';

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
  const [authorState, resolvedSearchParams] = await Promise.all([getProtectedAuthorState(), searchParams]);
  const notice = getValue(resolvedSearchParams.notice);
  const error = getValue(resolvedSearchParams.error);

  if (authorState.status !== 'authenticated') {
    return (
      <PageShell
        eyebrow="Authoring"
        title="Authoring requires Clerk-backed auth"
        description="Quiz edits and publish actions stay on the Next.js server boundary, so this workspace now blocks until the Clerk-backed author guard is wired."
      >
        <SectionCard title="Clerk integration required" eyebrow="Guard">
          <p className="text-sm text-muted-foreground">
            {authorState.status === 'setup-required' ? authorState.message : 'Sign in with Clerk to edit quizzes.'}
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
            <Link href={{ pathname: '/authoring', query: { quizId: quiz.quiz_id } }}>{quiz.title}</Link>
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