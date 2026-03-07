import Link from 'next/link';
import {
  addOptionAction,
  addQuestionAction,
  deleteOptionAction,
  deleteQuestionAction,
  moveOptionAction,
  moveQuestionAction,
  publishQuizAction,
  saveQuestionAction,
  saveQuizDetailsAction,
} from '@/app/actions';
import {
  AuthoringPersistenceReadinessSurface,
  AuthoringProtectedGuardSurface,
} from '@/components/protected-readiness-surfaces';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getAppOperationalReadiness, getAppService } from '@/lib/server/app-service';
import { CLERK_SIGN_IN_PATH, getProtectedAuthorState } from '@/lib/server/author-auth';
import { CONTRACT_LIMITS, type AuthoringQuizDocument, type QuestionType } from '@/lib/shared/contracts';

export const dynamic = 'force-dynamic';

function getValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

function sortQuestions(document: AuthoringQuizDocument) {
  return document.questions.slice().sort((left, right) => left.question.position - right.question.position);
}

function sortOptions(entry: AuthoringQuizDocument['questions'][number]) {
  return entry.options.slice().sort((left, right) => left.position - right.position);
}

function getMinimumOptionCount(questionType: QuestionType) {
  return questionType === 'multiple_choice'
    ? CONTRACT_LIMITS.multipleChoiceOptionCount.min
    : CONTRACT_LIMITS.singleChoiceOptionCount.min;
}

function getShuffleValue(value: boolean | undefined) {
  if (value === undefined) {
    return '';
  }

  return value ? 'true' : 'false';
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
    return <AuthoringProtectedGuardSurface authorState={authorState} signInPath={CLERK_SIGN_IN_PATH} />;
  }

  const actor = authorState.actor;
  const readiness = getAppOperationalReadiness();

  if (!readiness.canLoadAuthoring) {
    return <AuthoringPersistenceReadinessSurface missingEnvKeys={readiness.authoring.missingKeys} />;
  }

  const app = getAppService();
  const quizzes = await app.listQuizSummaries(actor);
  const selectedQuizId = getValue(resolvedSearchParams.quizId) ?? quizzes[0]?.quiz_id;
  const document = selectedQuizId ? await app.loadQuizDocument({ actor, quizId: selectedQuizId }) : null;
  const orderedQuestions = document ? sortQuestions(document) : [];

  return (
    <PageShell
      eyebrow="Authoring"
      title="Authoring workspace"
      description="Edit quiz metadata plus question and option content through the server-owned authoring boundary."
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
        <div className="grid gap-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
            <SectionCard title={document.quiz.title} eyebrow={`Quiz · ${document.quiz.status}`}>
              <form action={saveQuizDetailsAction} className="space-y-4">
                <input name="quizId" type="hidden" value={document.quiz.quiz_id} />
                <Label className="flex-col items-start gap-2 text-sm text-muted-foreground" htmlFor="quiz-title">
                  <span>Title</span>
                  <Input id="quiz-title" className="h-11 rounded-2xl bg-background/60 px-4" defaultValue={document.quiz.title} name="title" />
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

            <SectionCard title="Publish boundary" eyebrow="Runtime snapshot policy">
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Authoring edits stay on the Next.js server boundary and must pass shared document validation.</p>
                <p>Published quizzes remain editable for future rooms; existing room snapshots stay isolated from later authoring edits.</p>
                <p>
                  Question limits: {CONTRACT_LIMITS.publishedQuizQuestionCount.min}–{CONTRACT_LIMITS.publishedQuizQuestionCount.max} on publish.
                  Option limits: single choice {CONTRACT_LIMITS.singleChoiceOptionCount.min}–{CONTRACT_LIMITS.singleChoiceOptionCount.max}, multiple choice {CONTRACT_LIMITS.multipleChoiceOptionCount.min}–{CONTRACT_LIMITS.multipleChoiceOptionCount.max}.
                </p>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Questions" eyebrow="Editable authoring content">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Create, edit, order, and validate questions/options without exposing live runtime state.</p>
                <form action={addQuestionAction}>
                  <input name="quizId" type="hidden" value={document.quiz.quiz_id} />
                  <Button className="rounded-full px-4" disabled={orderedQuestions.length >= CONTRACT_LIMITS.publishedQuizQuestionCount.max} type="submit">
                    Add question
                  </Button>
                </form>
              </div>

              {orderedQuestions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/80 px-4 py-6 text-sm text-muted-foreground">
                  Add a first question to start the quiz document.
                </div>
              ) : (
                orderedQuestions.map((entry, questionIndex) => {
                  const orderedOptions = sortOptions(entry);
                  const minimumOptionCount = getMinimumOptionCount(entry.question.question_type);
                  const canDeleteQuestion =
                    document.quiz.status !== 'published' || orderedQuestions.length > CONTRACT_LIMITS.publishedQuizQuestionCount.min;

                  return (
                    <form
                      key={entry.question.question_id}
                      action={saveQuestionAction}
                      className="space-y-4 rounded-3xl border border-border/80 bg-background/40 p-4"
                    >
                      <input name="quizId" type="hidden" value={document.quiz.quiz_id} />
                      <input name="questionId" type="hidden" value={entry.question.question_id} />

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Question {questionIndex + 1}</p>
                          <p className="text-xs text-muted-foreground">{entry.question.question_type} · {orderedOptions.length} option(s)</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button formAction={moveQuestionAction} name="direction" value="up" variant="outline" disabled={questionIndex === 0}>
                            Move up
                          </Button>
                          <Button
                            formAction={moveQuestionAction}
                            name="direction"
                            value="down"
                            variant="outline"
                            disabled={questionIndex === orderedQuestions.length - 1}
                          >
                            Move down
                          </Button>
                          <Button formAction={deleteQuestionAction} type="submit" variant="outline" disabled={!canDeleteQuestion}>
                            Delete question
                          </Button>
                        </div>
                      </div>

                      <Label className="flex-col items-start gap-2 text-sm text-muted-foreground" htmlFor={`prompt-${entry.question.question_id}`}>
                        <span>Prompt</span>
                        <Textarea
                          id={`prompt-${entry.question.question_id}`}
                          className="min-h-24 rounded-2xl bg-background/60 px-4 py-3"
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

                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">Options</p>
                          <p className="text-xs text-muted-foreground">Minimum {minimumOptionCount}, maximum {CONTRACT_LIMITS.singleChoiceOptionCount.max} options.</p>
                        </div>

                        {orderedOptions.map((option, optionIndex) => (
                          <div key={option.option_id} className="space-y-3 rounded-2xl border border-border/70 bg-background/50 p-3">
                            <input name="optionId" type="hidden" value={option.option_id} />
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
        <SectionCard title="No quiz available" eyebrow="Authoring">
          <p className="text-sm text-muted-foreground">Return to the dashboard to choose a seeded quiz.</p>
        </SectionCard>
      )}
    </PageShell>
  );
}