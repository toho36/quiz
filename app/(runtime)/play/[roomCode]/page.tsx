import Link from 'next/link';
import { reconnectRoomAction, submitAnswerAction } from '@/app/actions';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { buildRuntimeQuizImageSrc } from '@/lib/client/runtime';
import { formatPlayerSubmissionStatus, formatQuestionPhase, formatRoomLifecycle } from '@/lib/i18n/app-shell';
import { getLocaleContext } from '@/lib/i18n/server';
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
  const [{ roomCode: rawRoomCode }, resolvedSearchParams, guestSessionId, { locale, dictionary }] = await Promise.all([
    params,
    searchParams,
    getDemoGuestSessionId(),
    getLocaleContext(),
  ]);
  const roomCode = rawRoomCode.toUpperCase();
  const storedBinding = await getDemoPlayerBinding(roomCode);
  const state = guestSessionId ? getAppService().findPlayerRoomState({ guestSessionId, roomCode }) : null;
  const notice = getValue(resolvedSearchParams.notice);
  const error = getValue(resolvedSearchParams.error);
  const nextPath = `/play/${encodeURIComponent(roomCode)}` as const;

  return (
    <PageShell
      eyebrow={dictionary.playPage.eyebrow}
      title={`${dictionary.playPage.titlePrefix} ${roomCode}`}
      description={dictionary.playPage.description}
      actions={<LocaleSwitcher locale={locale} nextPath={nextPath} dictionary={dictionary} />}
    >
      {(notice || error) && (
        <SectionCard
          title={error ? dictionary.playPage.errorTitle : dictionary.playPage.updatedTitle}
          eyebrow={error ? dictionary.playPage.errorEyebrow : dictionary.playPage.updatedEyebrow}
        >
          <p className="text-sm text-muted-foreground">{error ?? notice}</p>
        </SectionCard>
      )}

      {!state ? (
        <SectionCard title={dictionary.playPage.joinFirstTitle} eyebrow={dictionary.playPage.joinFirstEyebrow}>
          {storedBinding ? (
            <>
              <p className="text-sm text-muted-foreground">
                A stored player credential was found for {roomCode}. Reconnect to resume the same room-scoped player identity with a rotated token.
              </p>
              <form action={reconnectRoomAction} className="mt-4">
                <input name="roomCode" type="hidden" value={roomCode} />
                <Button className="h-10 rounded-full px-4" type="submit">
                  Reconnect player session
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                No player session is bound to {roomCode} yet. Use the join flow to create a room-scoped player identity before playing.
              </p>
              <Button asChild className="mt-4 h-auto px-0 text-primary" variant="link">
                <Link href={{ pathname: '/join', query: { roomCode } }}>{dictionary.playPage.goToJoinFlow}</Link>
              </Button>
            </>
          )}
        </SectionCard>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionCard title={state.self.display_name} eyebrow={`${dictionary.appLabels.roomPrefix} · ${formatRoomLifecycle(dictionary, state.shared_room.lifecycle_state)}`}>
            <dl className="space-y-3 text-sm text-muted-foreground">
              <div>
                <dt className="text-muted-foreground/70">{dictionary.appLabels.phaseLabel}</dt>
                <dd>{formatQuestionPhase(dictionary, state.shared_room.question_phase)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground/70">{dictionary.appLabels.scoreLabel}</dt>
                <dd>
                  {state.self.score_total} {dictionary.appLabels.pointsSuffix} · {state.self.correct_count} {dictionary.appLabels.correctLabel}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground/70">{dictionary.appLabels.submissionLabel}</dt>
                <dd>{formatPlayerSubmissionStatus(dictionary, state.self.submission_status)}</dd>
              </div>
            </dl>

            {state.active_question && state.shared_room.question_phase === 'question_open' && state.self.submission_status === 'not_submitted' ? (
              <form action={submitAnswerAction} className="mt-4 space-y-3">
                <input name="roomCode" type="hidden" value={roomCode} />
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">{state.active_question.prompt}</p>
                  {state.active_question.image && (
                    <img
                      alt={dictionary.playPage.questionImageAlt}
                      className="max-h-64 rounded-2xl border border-border object-contain"
                      src={buildRuntimeQuizImageSrc({ roomCode, objectKey: state.active_question.image.object_key, viewer: 'player' })}
                    />
                  )}
                </div>
                {state.active_question.display_options.map((option) => (
                  <label key={option.option_id} className="flex gap-3 rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
                    <input
                      name="selectedOptionIds"
                      type={state.active_question?.question_type === 'single_choice' ? 'radio' : 'checkbox'}
                      value={option.option_id}
                    />
                    <span className="flex flex-1 flex-col gap-2">
                      <span>{option.text}</span>
                      {option.image && (
                        <img
                          alt={`${dictionary.playPage.optionImageAlt} ${option.display_position}`}
                          className="max-h-40 rounded-2xl border border-border object-contain"
                          src={buildRuntimeQuizImageSrc({ roomCode, objectKey: option.image.object_key, viewer: 'player' })}
                        />
                      )}
                    </span>
                  </label>
                ))}
                <Button className="h-10 rounded-full px-4" type="submit">
                  {dictionary.playPage.submitAnswer}
                </Button>
              </form>
            ) : (
              <div className="mt-4 space-y-3">
                {state.active_question && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground">{state.active_question.prompt}</p>
                    {state.active_question.image && (
                      <img
                        alt={dictionary.playPage.questionImageAlt}
                        className="max-h-64 rounded-2xl border border-border object-contain"
                        src={buildRuntimeQuizImageSrc({ roomCode, objectKey: state.active_question.image.object_key, viewer: 'player' })}
                      />
                    )}
                    {state.active_question.display_options.length > 0 && (
                      <ul className="space-y-3">
                        {state.active_question.display_options.map((option) => (
                          <li key={option.option_id} className="rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
                            <p className="font-medium text-foreground">
                              {option.display_position}. {option.text}
                            </p>
                            {option.image && (
                              <img
                                alt={`${dictionary.playPage.optionImageAlt} ${option.display_position}`}
                                className="mt-3 max-h-40 rounded-2xl border border-border object-contain"
                                src={buildRuntimeQuizImageSrc({ roomCode, objectKey: option.image.object_key, viewer: 'player' })}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <div className="rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
                  {state.shared_room.lifecycle_state === 'lobby'
                    ? dictionary.playPage.waitingForHost
                    : state.self.latest_outcome
                      ? `${dictionary.playPage.latestResultPrefix} ${state.self.latest_outcome.awarded_points} ${dictionary.appLabels.pointsSuffix} (${state.self.latest_outcome.is_correct ? dictionary.appLabels.correctLabel : dictionary.appLabels.incorrectLabel})${dictionary.playPage.latestResultSuffix}`
                      : dictionary.playPage.waitingForNextTransition}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title={dictionary.playPage.sharedStateTitle} eyebrow={dictionary.playPage.sharedStateEyebrow}>
            <p className="text-sm text-muted-foreground">
              {dictionary.appLabels.currentQuestionLabel}: {state.active_question?.prompt ?? dictionary.playPage.noActiveQuestion}
            </p>
            {state.leaderboard && (
              <ol className="mt-4 space-y-2 text-sm text-muted-foreground">
                {state.leaderboard.map((entry) => (
                  <li key={entry.room_player_id}>
                    #{entry.rank} {entry.display_name} · {entry.score_total} {dictionary.appLabels.pointsSuffix}
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