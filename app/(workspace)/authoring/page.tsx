import Link from 'next/link';
import {
  addOptionAction,
  addQuestionAction,
  deleteOptionAction,
  deleteQuestionAction,
  moveOptionAction,
  moveQuestionAction,
  publishQuizAction,
  removeQuizImageAction,
  saveQuestionAction,
  saveQuizDetailsAction,
  uploadQuizImageAction,
} from '@/app/actions';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatQuestionType, formatQuizStatus } from '@/lib/i18n/app-shell';
import { getLocaleContext } from '@/lib/i18n/server';
import { getAppOperationalReadiness, getAppService } from '@/lib/server/app-service';
import { CLERK_SIGN_IN_PATH, getProtectedAuthorState } from '@/lib/server/author-auth';
import { QUIZ_IMAGE_ACCEPT_VALUE } from '@/lib/server/quiz-image-assets';
import { CONTRACT_LIMITS, type AuthoringQuizDocument, type QuestionType } from '@/lib/shared/contracts';

export const dynamic = 'force-dynamic';

type AuthoringSearchParams = Promise<{ error?: string; notice?: string; quizId?: string }>;

function getValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

function buildPreviewSrc(quizId: string, objectKey: string) {
  const search = new URLSearchParams({ quizId, objectKey });
  return `/authoring/assets?${search.toString()}`;
}

function sortQuestions(document: AuthoringQuizDocument) {
  return document.questions.slice().sort((left, right) => left.question.position - right.question.position);
}

function sortOptions(options: AuthoringQuizDocument['questions'][number]['options']) {
  return options.slice().sort((left, right) => left.position - right.position);
}

function getMinimumOptionCount(questionType: QuestionType) {
  return questionType === 'multiple_choice'
    ? CONTRACT_LIMITS.multipleChoiceOptionCount.min
    : CONTRACT_LIMITS.singleChoiceOptionCount.min;
}

function getShuffleValue(value: boolean | null | undefined) {
  if (value === undefined || value === null) {
    return '';
  }
  return value ? 'true' : 'false';
}

export default async function AuthoringPage({
  searchParams,
}: {
  searchParams: AuthoringSearchParams;
}) {
  const [authorState, resolvedSearchParams, { locale, dictionary }] = await Promise.all([
    getProtectedAuthorState(),
    searchParams,
    getLocaleContext(),
  ]);
  const notice = getValue(resolvedSearchParams.notice);
  const error = getValue(resolvedSearchParams.error);

  if (authorState.status !== 'authenticated') {
    return (
      <PageShell
        eyebrow={dictionary.routes.items.authoring.label}
        title={dictionary.authoringPage.guardedTitle}
        description={dictionary.authoringPage.guardedDescription}
        actions={<LocaleSwitcher locale={locale} nextPath="/authoring" dictionary={dictionary} />}
      >
        <SectionCard title={dictionary.authoringPage.signInTitle} eyebrow={dictionary.authoringPage.signInEyebrow}>
          {authorState.status === 'unauthenticated' ? (
            <div className="mt-2">
              <Button asChild className="h-10 rounded-full px-4">
                <Link href={CLERK_SIGN_IN_PATH}>{dictionary.authoringPage.signInTitle}</Link>
              </Button>
            </div>
          ) : (
            <div className="mt-2 space-y-2 text-sm text-muted-foreground">
              <p>{authorState.message}</p>
              {authorState.missingEnvKeys.length > 0 ? <p>Missing env: {authorState.missingEnvKeys.join(', ')}</p> : null}
            </div>
          )}
        </SectionCard>
      </PageShell>
    );
  }

  const actor = authorState.actor;
  const readiness = getAppOperationalReadiness();

  if (!readiness.canLoadAuthoring) {
    return (
      <PageShell
        eyebrow={dictionary.routes.items.authoring.label}
        title={dictionary.authoringPage.guardedTitle}
        description={dictionary.authoringPage.guardedDescription}
        actions={<LocaleSwitcher locale={locale} nextPath="/authoring" dictionary={dictionary} />}
      >
        <SectionCard title={dictionary.authoringPage.errorTitle} eyebrow={dictionary.authoringPage.errorEyebrow}>
          <p className="text-sm text-muted-foreground">Missing env: {readiness.authoring.missingKeys.join(', ')}</p>
        </SectionCard>
      </PageShell>
    );
  }

  const app = getAppService();
  const quizzes = await app.listQuizSummaries(actor);
  const selectedQuizId = getValue(resolvedSearchParams.quizId) ?? quizzes[0]?.quiz_id;
  const document = selectedQuizId ? await app.loadQuizDocument({ actor, quizId: selectedQuizId }) : null;
  const orderedQuestions = document ? sortQuestions(document) : [];
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

      {document ? (
        <div className="grid gap-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
            <SectionCard
              title={document.quiz.title}
              eyebrow={formatQuizStatus(dictionary, document.quiz.status)}
            >
              <form action={saveQuizDetailsAction} className="space-y-6">
                <input name="quizId" type="hidden" value={document.quiz.quiz_id} />
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground" htmlFor="quiz-title">
                    {dictionary.authoringPage.titleLabel}
                  </Label>
                  <Input id="quiz-title" className="h-11 rounded-2xl bg-background/60 px-4" defaultValue={document.quiz.title} name="title" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground" htmlFor="quiz-description">
                    {dictionary.authoringPage.descriptionLabel}
                  </Label>
                  <Textarea
                    id="quiz-description"
                    className="min-h-[140px] rounded-3xl bg-background/60 px-4 py-3"
                    defaultValue={document.quiz.description}
                    name="description"
                  />
                </div>
                <div>
                  <div className="space-y-3 rounded-3xl border border-border/70 bg-background/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
                      {dictionary.authoringPage.updatedTitle}
                    </p>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>
                        {dictionary.authoringPage.updatedEyebrow}{' '}
                        <span className="font-medium text-foreground">{formatQuizStatus(dictionary, document.quiz.status)}</span>
                      </p>
                      <p>{dictionary.authoringPage.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button className="h-10 rounded-full px-4" type="submit">{dictionary.authoringPage.saveDraft}</Button>
                      {document.quiz.status === 'draft' ? (
                        <Button className="h-10 rounded-full px-4" formAction={publishQuizAction} type="submit" variant="outline">
                          {dictionary.authoringPage.publishQuiz}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </form>
            </SectionCard>

            <SectionCard title={dictionary.authoringPage.boundaryTitle} eyebrow={dictionary.authoringPage.boundaryEyebrow}>
              <p className="mb-3 text-sm text-muted-foreground">{dictionary.authoringPage.boundaryDescription}</p>
              <div className="mt-6 space-y-2 text-xs uppercase tracking-[0.22em] text-muted-foreground/70">
                {quizzes.map((quiz) => (
                  <Link key={quiz.quiz_id} className="block hover:text-white" href={`/authoring?quizId=${quiz.quiz_id}`}>
                    {quiz.title}
                  </Link>
                ))}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Question set" eyebrow={`${orderedQuestions.length} configured question${orderedQuestions.length === 1 ? '' : 's'}`}>
            <div className="flex flex-wrap gap-2">
              <form action={addQuestionAction}>
                <input name="quizId" type="hidden" value={document.quiz.quiz_id} />
                <Button type="submit">Add question</Button>
              </form>
            </div>

            <div className="mt-6 space-y-5">
              {orderedQuestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No questions yet. Add the first question to start building this quiz.</p>
              ) : (
                orderedQuestions.map((entry, index) => {
                  const orderedOptions = sortOptions(entry.options);
                  const minimumOptionCount = getMinimumOptionCount(entry.question.question_type);

                  return (
                    <form
                      key={entry.question.question_id}
                      action={saveQuestionAction}
                      className="space-y-4 rounded-3xl border border-border/80 bg-background/40 p-4"
                      encType="multipart/form-data"
                    >
                      <input name="quizId" type="hidden" value={document.quiz.quiz_id} />
                      <input name="questionId" type="hidden" value={entry.question.question_id} />
                      {orderedOptions.map((option) => (
                        <input key={option.option_id} name="optionId" type="hidden" value={option.option_id} />
                      ))}

                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Question {index + 1}</p>
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            {formatQuestionType(dictionary, entry.question.question_type)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button formAction={moveQuestionAction} name="questionMove" value={`${entry.question.question_id}:up`} variant="outline" disabled={index === 0}>
                            Move up
                          </Button>
                          <Button
                            formAction={moveQuestionAction}
                            name="questionMove"
                            value={`${entry.question.question_id}:down`}
                            variant="outline"
                            disabled={index === orderedQuestions.length - 1}
                          >
                            Move down
                          </Button>
                          <Button formAction={deleteQuestionAction} name="targetQuestionId" value={entry.question.question_id} variant="outline">
                            Delete question
                          </Button>
                        </div>
                      </div>

                      <Label className="flex-col items-start gap-2 text-sm text-muted-foreground" htmlFor={`prompt-${entry.question.question_id}`}>
                        <span>Prompt</span>
                        <Textarea
                          id={`prompt-${entry.question.question_id}`}
                          className="min-h-[120px] rounded-3xl bg-background/60 px-4 py-3"
                          defaultValue={entry.question.prompt}
                          name="prompt"
                        />
                      </Label>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Label className="flex-col items-start gap-2 text-sm text-muted-foreground">
                          <span>Question type</span>
                          <select
                            className="h-11 w-full rounded-2xl border border-border bg-background/60 px-4 text-sm text-foreground"
                            defaultValue={entry.question.question_type}
                            name="questionType"
                          >
                            <option value="single_choice">single_choice</option>
                            <option value="multiple_choice">multiple_choice</option>
                          </select>
                        </Label>
                        <Label className="flex-col items-start gap-2 text-sm text-muted-foreground">
                          <span>Base points</span>
                          <Input className="h-11 rounded-2xl bg-background/60 px-4" defaultValue={String(entry.question.base_points)} name="basePoints" type="number" />
                        </Label>
                        <Label className="flex-col items-start gap-2 text-sm text-muted-foreground">
                          <span>Time limit (seconds)</span>
                          <Input
                            className="h-11 rounded-2xl bg-background/60 px-4"
                            defaultValue={entry.question.time_limit_seconds?.toString() ?? ''}
                            name="timeLimitSeconds"
                            type="number"
                          />
                        </Label>
                        <Label className="flex-col items-start gap-2 text-sm text-muted-foreground">
                          <span>Shuffle answers</span>
                          <select
                            className="h-11 w-full rounded-2xl border border-border bg-background/60 px-4 text-sm text-foreground"
                            defaultValue={getShuffleValue(entry.question.shuffle_answers)}
                            name="shuffleAnswers"
                          >
                            <option value="">Use quiz default</option>
                            <option value="true">Shuffle</option>
                            <option value="false">Keep author order</option>
                          </select>
                        </Label>
                      </div>

                      <div className="space-y-3 rounded-2xl border border-border/70 bg-background/50 p-3">
                        <p className="text-sm font-medium text-foreground">Question image</p>
                        {entry.question.image ? (
                          <div className="space-y-3">
                            <div className="overflow-hidden rounded-2xl border border-border/70 bg-canvas/70">
                              <img
                                alt={dictionary.authoringPage.questionImageAlt}
                                className="h-full max-h-64 w-full object-cover"
                                src={buildPreviewSrc(document.quiz.quiz_id, entry.question.image.object_key)}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">{dictionary.authoringPage.questionImageAlt}</p>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">{dictionary.authoringPage.noQuestionImage}</p>
                        )}
                        <Input accept={QUIZ_IMAGE_ACCEPT_VALUE} className="rounded-2xl bg-background/60" name="image" type="file" />
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-full border border-border px-4 py-2 text-sm" formAction={uploadQuizImageAction} name="scope" type="submit" value={`question:${entry.question.question_id}`}>
                            {entry.question.image ? dictionary.authoringPage.replaceQuestionImage : dictionary.authoringPage.uploadQuestionImage}
                          </button>
                          {entry.question.image ? (
                            <button className="rounded-full border border-border px-4 py-2 text-sm" formAction={removeQuizImageAction} name="scope" type="submit" value={`question:${entry.question.question_id}`}>
                              {dictionary.authoringPage.removeQuestionImage}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">Options</p>
                          <p className="text-xs text-muted-foreground">Minimum {minimumOptionCount}, maximum {CONTRACT_LIMITS.singleChoiceOptionCount.max} options.</p>
                        </div>

                        {orderedOptions.map((option, optionIndex) => (
                          <div key={option.option_id} className="space-y-3 rounded-2xl border border-border/70 bg-background/50 p-3">
                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                              <Label className="flex-col items-start gap-2 text-sm text-muted-foreground" htmlFor={`option-${option.option_id}`}>
                                <span>Option {optionIndex + 1}</span>
                                <Input
                                  id={`option-${option.option_id}`}
                                  className="h-11 rounded-2xl bg-background/60 px-4"
                                  defaultValue={option.text}
                                  name={`optionText:${option.option_id}`}
                                />
                              </Label>
                              <Label className="flex items-center gap-2 rounded-2xl border border-border/70 px-3 py-3 text-sm text-muted-foreground">
                                <input defaultChecked={option.is_correct} name={`optionCorrect:${option.option_id}`} type="checkbox" />
                                Correct answer
                              </Label>
                            </div>

                            <div className="space-y-3 rounded-2xl border border-border/60 bg-background/40 p-3">
                              <p className="text-sm font-medium text-foreground">Option image</p>
                              {option.image ? (
                                <div className="space-y-3">
                                  <div className="overflow-hidden rounded-2xl border border-border/70 bg-canvas/70">
                                    <img
                                      alt={dictionary.authoringPage.optionImageAlt}
                                      className="h-full max-h-56 w-full object-cover"
                                      src={buildPreviewSrc(document.quiz.quiz_id, option.image.object_key)}
                                    />
                                  </div>
                                  <p className="text-xs text-muted-foreground">{dictionary.authoringPage.optionImageAlt}</p>
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">{dictionary.authoringPage.noOptionImage}</p>
                              )}
                              <Input accept={QUIZ_IMAGE_ACCEPT_VALUE} className="rounded-2xl bg-background/60" name="image" type="file" />
                              <div className="flex flex-wrap gap-2">
                                <button
                                  className="rounded-full border border-border px-4 py-2 text-sm"
                                  formAction={uploadQuizImageAction}
                                  name="scope"
                                  type="submit"
                                  value={`option:${entry.question.question_id}:${option.option_id}`}
                                >
                                  {option.image ? dictionary.authoringPage.replaceOptionImage : dictionary.authoringPage.uploadOptionImage}
                                </button>
                                {option.image ? (
                                  <button
                                    className="rounded-full border border-border px-4 py-2 text-sm"
                                    formAction={removeQuizImageAction}
                                    name="scope"
                                    type="submit"
                                    value={`option:${entry.question.question_id}:${option.option_id}`}
                                  >
                                    {dictionary.authoringPage.removeOptionImage}
                                  </button>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button formAction={moveOptionAction} name="optionMove" value={`${option.option_id}:up`} variant="outline" disabled={optionIndex === 0}>
                                Move up
                              </Button>
                              <Button
                                formAction={moveOptionAction}
                                name="optionMove"
                                value={`${option.option_id}:down`}
                                variant="outline"
                                disabled={optionIndex === orderedOptions.length - 1}
                              >
                                Move down
                              </Button>
                              <Button
                                formAction={deleteOptionAction}
                                name="targetOptionId"
                                value={option.option_id}
                                variant="outline"
                                disabled={orderedOptions.length <= minimumOptionCount}
                              >
                                Delete option
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button type="submit">Save question</Button>
                        <Button formAction={addOptionAction} type="submit" variant="outline">
                          Add option
                        </Button>
                      </div>
                    </form>
                  );
                })
              )}
            </div>
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
