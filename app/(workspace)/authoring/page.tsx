import type { Route } from 'next';
import Link from 'next/link';
import { publishQuizAction, removeQuizImageAction, saveQuizDetailsAction, signInDemoAuthorAction, uploadQuizImageAction } from '@/app/actions';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatQuestionType, formatQuizStatus } from '@/lib/i18n/app-shell';
import { getLocaleContext } from '@/lib/i18n/server';
import { getDemoAppService } from '@/lib/server/demo-app-service';
import { QUIZ_IMAGE_ACCEPT_VALUE } from '@/lib/server/quiz-image-assets';
import { getDemoAuthorActor } from '@/lib/server/demo-session';
import { CONTRACT_LIMITS } from '@/lib/shared/contracts';

export const dynamic = 'force-dynamic';

function getValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

function buildPreviewSrc(quizId: string, objectKey: string) {
  const search = new URLSearchParams({ quizId, objectKey });
  return `/authoring/assets?${search.toString()}`;
}

type AuthoringSearchParams = Promise<{ quizId?: string; error?: string; notice?: string }>;

export default async function AuthoringPage({
  searchParams,
}: {
  searchParams: AuthoringSearchParams;
}) {
  const [actor, resolvedSearchParams, { locale, dictionary }] = await Promise.all([getDemoAuthorActor(), searchParams, getLocaleContext()]);
  const notice = getValue(resolvedSearchParams.notice);
  const error = getValue(resolvedSearchParams.error);

  if (!actor) {
    return (
      <PageShell
        eyebrow={dictionary.routes.items.authoring.label}
        title={dictionary.authoringPage.guardedTitle}
        description={dictionary.authoringPage.guardedDescription}
        actions={<LocaleSwitcher locale={locale} nextPath="/authoring" dictionary={dictionary} />}
      >
        <SectionCard title={dictionary.authoringPage.signInTitle} eyebrow={dictionary.authoringPage.signInEyebrow}>
          <form action={signInDemoAuthorAction} className="mt-2">
            <input name="next" type="hidden" value="/authoring" />
            <Button className="h-10 rounded-full px-4" type="submit">
              {dictionary.landing.continueAsDemoAuthor}
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
  const nextPath = selectedQuizId ? (`/authoring?quizId=${selectedQuizId}` as const) : '/authoring';

  return (
    <PageShell
      eyebrow={dictionary.routes.items.authoring.label}
      title={dictionary.authoringPage.title}
      description={dictionary.authoringPage.description}
      actions={<LocaleSwitcher locale={locale} nextPath={nextPath} dictionary={dictionary} />}
    >
      {(notice || error) && (
        <SectionCard
          title={error ? dictionary.authoringPage.errorTitle : dictionary.authoringPage.updatedTitle}
          eyebrow={error ? dictionary.authoringPage.errorEyebrow : dictionary.authoringPage.updatedEyebrow}
        >
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
          <SectionCard
            title={document.quiz.title}
            eyebrow={`${dictionary.appLabels.quizPrefix} · ${formatQuizStatus(dictionary, document.quiz.status)}`}
          >
            <form action={saveQuizDetailsAction} className="space-y-4">
              <input name="quizId" type="hidden" value={document.quiz.quiz_id} />
              <Label className="flex-col items-start gap-2 text-sm text-muted-foreground" htmlFor="quiz-title">
                <span>{dictionary.authoringPage.titleLabel}</span>
                <Input
                  id="quiz-title"
                  className="h-11 rounded-2xl bg-background/60 px-4"
                  defaultValue={document.quiz.title}
                  name="title"
                />
              </Label>
              <Label className="flex-col items-start gap-2 text-sm text-muted-foreground" htmlFor="quiz-description">
                <span>{dictionary.authoringPage.descriptionLabel}</span>
                <Textarea
                  id="quiz-description"
                  className="min-h-32 rounded-2xl bg-background/60 px-4 py-3"
                  defaultValue={document.quiz.description}
                  name="description"
                />
              </Label>
              <div className="flex flex-wrap gap-3">
                <Button className="h-10 rounded-full px-4" type="submit">
                  {dictionary.authoringPage.saveDraft}
                </Button>
                {document.quiz.status === 'draft' && (
                  <Button className="h-10 rounded-full px-4" formAction={publishQuizAction} type="submit" variant="outline">
                    {dictionary.authoringPage.publishQuiz}
                  </Button>
                )}
              </div>
            </form>
          </SectionCard>

          <SectionCard title={dictionary.authoringPage.boundaryTitle} eyebrow={dictionary.authoringPage.boundaryEyebrow}>
            <p className="mb-3 text-sm text-muted-foreground">
              {dictionary.authoringPage.boundaryDescription} {CONTRACT_LIMITS.quizImageMaxBytes / (1024 * 1024)} MiB.
            </p>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {document.questions.map((entry) => (
                <li key={entry.question.question_id} className="rounded-2xl border border-border/80 bg-background/40 px-4 py-3">
                  <p className="font-medium text-foreground">{entry.question.prompt}</p>
                  <p className="mt-1 text-muted-foreground/80">{formatQuestionType(dictionary, entry.question.question_type)} · {entry.options.length}</p>
                  <div className="mt-3 space-y-3 rounded-2xl border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.authoringPage.questionImageTitle}</p>
                    {entry.question.image ? (
                      <div className="space-y-2">
                        <img
                          alt={`${dictionary.authoringPage.questionImageAlt} ${entry.question.position}`}
                          className="max-h-48 rounded-xl border border-border/80 object-contain"
                          src={buildPreviewSrc(document.quiz.quiz_id, entry.question.image.object_key)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {entry.question.image.content_type} · {entry.question.image.width}×{entry.question.image.height} · {entry.question.image.bytes}{' '}
                          {dictionary.appLabels.bytesLabel}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{dictionary.authoringPage.noQuestionImage}</p>
                    )}
                    <form action={uploadQuizImageAction} className="space-y-3" encType="multipart/form-data">
                      <input name="quizId" type="hidden" value={document.quiz.quiz_id} />
                      <input name="questionId" type="hidden" value={entry.question.question_id} />
                      <Label className="flex-col items-start gap-2 text-sm text-muted-foreground">
                        <span>{entry.question.image ? dictionary.authoringPage.replaceQuestionImage : dictionary.authoringPage.uploadQuestionImage}</span>
                        <Input accept={QUIZ_IMAGE_ACCEPT_VALUE} className="h-11 rounded-2xl bg-background/60 px-4" name="image" type="file" />
                      </Label>
                      <div className="flex flex-wrap gap-3">
                        <Button className="h-10 rounded-full px-4" type="submit">
                          {entry.question.image ? dictionary.authoringPage.replaceQuestionImage : dictionary.authoringPage.uploadQuestionImage}
                        </Button>
                      </div>
                    </form>
                    {entry.question.image && (
                      <form action={removeQuizImageAction}>
                        <input name="quizId" type="hidden" value={document.quiz.quiz_id} />
                        <input name="questionId" type="hidden" value={entry.question.question_id} />
                        <Button className="h-10 rounded-full px-4" type="submit" variant="outline">
                          {dictionary.authoringPage.removeQuestionImage}
                        </Button>
                      </form>
                    )}
                  </div>
                  <ul className="mt-3 space-y-3">
                    {entry.options.map((option) => (
                      <li key={option.option_id} className="rounded-2xl border border-border/70 bg-background/50 p-3">
                        <p className="font-medium text-foreground">{option.text}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{dictionary.appLabels.optionLabel} {option.position}</p>
                        <div className="mt-3 space-y-3">
                          {option.image ? (
                            <div className="space-y-2">
                              <img
                                alt={`${dictionary.authoringPage.optionImageAlt} ${option.position}`}
                                className="max-h-40 rounded-xl border border-border/80 object-contain"
                                src={buildPreviewSrc(document.quiz.quiz_id, option.image.object_key)}
                              />
                              <p className="text-xs text-muted-foreground">
                                {option.image.content_type} · {option.image.width}×{option.image.height} · {option.image.bytes} {dictionary.appLabels.bytesLabel}
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">{dictionary.authoringPage.noOptionImage}</p>
                          )}
                          <form action={uploadQuizImageAction} className="space-y-3" encType="multipart/form-data">
                            <input name="quizId" type="hidden" value={document.quiz.quiz_id} />
                            <input name="questionId" type="hidden" value={entry.question.question_id} />
                            <input name="optionId" type="hidden" value={option.option_id} />
                            <Label className="flex-col items-start gap-2 text-sm text-muted-foreground">
                              <span>{option.image ? dictionary.authoringPage.replaceOptionImage : dictionary.authoringPage.uploadOptionImage}</span>
                              <Input accept={QUIZ_IMAGE_ACCEPT_VALUE} className="h-11 rounded-2xl bg-background/60 px-4" name="image" type="file" />
                            </Label>
                            <div className="flex flex-wrap gap-3">
                              <Button className="h-10 rounded-full px-4" type="submit">
                                {option.image ? dictionary.authoringPage.replaceOptionImage : dictionary.authoringPage.uploadOptionImage}
                              </Button>
                            </div>
                          </form>
                          {option.image && (
                            <form action={removeQuizImageAction}>
                              <input name="quizId" type="hidden" value={document.quiz.quiz_id} />
                              <input name="questionId" type="hidden" value={entry.question.question_id} />
                              <input name="optionId" type="hidden" value={option.option_id} />
                              <Button className="h-10 rounded-full px-4" type="submit" variant="outline">
                                {dictionary.authoringPage.removeOptionImage}
                              </Button>
                            </form>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      ) : (
        <SectionCard title={dictionary.authoringPage.noQuizTitle} eyebrow={dictionary.authoringPage.noQuizEyebrow}>
          <p className="text-sm text-muted-foreground">{dictionary.authoringPage.noQuizDescription}</p>
        </SectionCard>
      )}
    </PageShell>
  );
}