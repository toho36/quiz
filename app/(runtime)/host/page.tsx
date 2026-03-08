import type { Route } from 'next';
import Link from 'next/link';
import { hostRoomAction, signInDemoAuthorAction } from '@/app/actions';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { buildRuntimeQuizImageSrc } from '@/lib/client/runtime';
import { formatHostAction, formatQuestionPhase, formatRoomLifecycle } from '@/lib/i18n/app-shell';
import { getLocaleContext } from '@/lib/i18n/server';
import { getDemoAppService } from '@/lib/server/demo-app-service';
import { getDemoAuthorActor } from '@/lib/server/demo-session';

export const dynamic = 'force-dynamic';

function getValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

type HostSearchParams = Promise<{ roomCode?: string; error?: string; notice?: string }>;

export default async function HostPage({
  searchParams,
}: {
  searchParams: HostSearchParams;
}) {
  const [actor, resolvedSearchParams, { locale, dictionary }] = await Promise.all([getDemoAuthorActor(), searchParams, getLocaleContext()]);
  const notice = getValue(resolvedSearchParams.notice);
  const error = getValue(resolvedSearchParams.error);
  const selectedRoomCode = getValue(resolvedSearchParams.roomCode);
  const nextPath = selectedRoomCode ? (`/host?roomCode=${selectedRoomCode}` as const) : '/host';

  if (!actor) {
    return (
      <PageShell
        eyebrow={dictionary.routes.items.host.label}
        title={dictionary.hostPage.guardedTitle}
        description={dictionary.hostPage.guardedDescription}
        actions={<LocaleSwitcher locale={locale} nextPath={nextPath} dictionary={dictionary} />}
      >
        <SectionCard title={dictionary.hostPage.signInTitle} eyebrow={dictionary.hostPage.signInEyebrow}>
          <form action={signInDemoAuthorAction} className="mt-2">
            <input name="next" type="hidden" value="/host" />
            <Button className="h-10 rounded-full px-4" type="submit">
              {dictionary.landing.continueAsDemoAuthor}
            </Button>
          </form>
        </SectionCard>
      </PageShell>
    );
  }

  const app = getDemoAppService();
  const rooms = app.listActiveRooms(actor);
  const details = selectedRoomCode ? app.findHostRoomDetails({ actor, roomCode: selectedRoomCode }) : null;

  return (
    <PageShell
      eyebrow={dictionary.routes.items.host.label}
      title={dictionary.hostPage.title}
      description={dictionary.hostPage.description}
      actions={<LocaleSwitcher locale={locale} nextPath={nextPath} dictionary={dictionary} />}
    >
      {(notice || error) && (
        <SectionCard
          title={error ? dictionary.hostPage.errorTitle : dictionary.hostPage.updatedTitle}
          eyebrow={error ? dictionary.hostPage.errorEyebrow : dictionary.hostPage.updatedEyebrow}
        >
          <p className="text-sm text-slate-300">{error ?? notice}</p>
        </SectionCard>
      )}

      {!details ? (
        <SectionCard title={dictionary.hostPage.selectRoomTitle} eyebrow={dictionary.hostPage.selectRoomEyebrow}>
          {rooms.length === 0 ? (
            <p className="text-sm text-slate-300">{dictionary.hostPage.noRooms}</p>
          ) : (
            <ul className="space-y-3 text-sm text-slate-300">
              {rooms.map((room) => (
                <li key={room.room_code} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
                  <span>
                    {room.room_code} · {formatRoomLifecycle(dictionary, room.lifecycle_state)} · {dictionary.appLabels.joinedPlayersLabel}: {room.joined_player_count}
                  </span>
                  <Link className="text-sky-300 hover:text-sky-200" href={`/host?roomCode=${room.room_code}` as Route}>
                    {dictionary.hostPage.openHostRoom}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionCard
            title={`${dictionary.hostPage.roomTitle} ${details.state.shared_room.room_code}`}
            eyebrow={`${dictionary.appLabels.runtimePrefix} · ${formatRoomLifecycle(dictionary, details.state.shared_room.lifecycle_state)}`}
          >
            <dl className="space-y-3 text-sm text-slate-300">
              <div>
                <dt className="text-slate-500">{dictionary.appLabels.sourceQuizLabel}</dt>
                <dd>{details.bootstrap?.source_quiz_id ?? details.state.shared_room.room_id}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{dictionary.appLabels.currentPhaseLabel}</dt>
                <dd>{formatQuestionPhase(dictionary, details.state.shared_room.question_phase)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{dictionary.appLabels.joinedPlayersLabel}</dt>
                <dd>{details.state.joined_player_count}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{dictionary.appLabels.joinUrlLabel}</dt>
                <dd>
                  <Link className="text-sky-300 hover:text-sky-200" href={`/join?roomCode=${details.state.shared_room.room_code}` as Route}>
                    {dictionary.hostPage.openJoinFlow} {details.state.shared_room.room_code}
                  </Link>
                </dd>
              </div>
            </dl>
            {details.state.allowed_actions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3">
                {details.state.allowed_actions.map((action) => (
                  <form key={action} action={hostRoomAction}>
                    <input name="roomCode" type="hidden" value={details.state.shared_room.room_code} />
                    <input name="action" type="hidden" value={action} />
                    <Button className="h-10 rounded-full px-4" type="submit">
                      {formatHostAction(dictionary, action)}
                    </Button>
                  </form>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title={dictionary.hostPage.liveRoomTitle} eyebrow={dictionary.hostPage.liveRoomEyebrow}>
            <dl className="space-y-3 text-sm text-slate-300">
              <div>
                <dt className="text-slate-500">{dictionary.appLabels.submissionProgressLabel}</dt>
                <dd>
                  {details.state.submission_progress.submitted_player_count} / {details.state.submission_progress.total_player_count}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{dictionary.appLabels.connectedPlayersLabel}</dt>
                <dd>{details.state.connected_player_count}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{dictionary.appLabels.activePromptLabel}</dt>
                <dd>{details.state.active_question?.prompt ?? dictionary.hostPage.waitingForStart}</dd>
              </div>
            </dl>
            {details.state.active_question && (
              <div className="mt-4 space-y-3">
                {details.state.active_question.image && (
                  <img
                    alt={dictionary.hostPage.questionImageAlt}
                    className="max-h-64 rounded-2xl border border-border object-contain"
                    src={buildRuntimeQuizImageSrc({
                      roomCode: details.state.shared_room.room_code,
                      objectKey: details.state.active_question.image.object_key,
                      viewer: 'host',
                    })}
                  />
                )}
                {details.state.active_question.display_options.length > 0 && (
                  <ul className="space-y-3">
                    {details.state.active_question.display_options.map((option) => (
                      <li key={option.option_id} className="rounded-2xl border border-border px-4 py-3 text-sm text-slate-300">
                        <p className="font-medium text-white">
                          {option.display_position}. {option.text}
                        </p>
                        {option.image && (
                          <img
                            alt={`${dictionary.hostPage.optionImageAlt} ${option.display_position}`}
                            className="mt-3 max-h-40 rounded-2xl border border-border object-contain"
                            src={buildRuntimeQuizImageSrc({
                              roomCode: details.state.shared_room.room_code,
                              objectKey: option.image.object_key,
                              viewer: 'host',
                            })}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {details.state.leaderboard && (
              <ol className="mt-4 space-y-2 text-sm text-slate-300">
                {details.state.leaderboard.map((entry) => (
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