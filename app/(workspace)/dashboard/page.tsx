import type { Route } from 'next';
import Link from 'next/link';
import { createRoomAction, publishQuizAction, signInDemoAuthorAction, signOutDemoAuthorAction } from '@/app/actions';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { formatQuizStatus, formatRoomLifecycle } from '@/lib/i18n/app-shell';
import { getLocaleContext } from '@/lib/i18n/server';
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
  const [actor, resolvedSearchParams, { locale, dictionary }] = await Promise.all([getDemoAuthorActor(), searchParams, getLocaleContext()]);
  const notice = getValue(resolvedSearchParams.notice);
  const error = getValue(resolvedSearchParams.error);

  if (!actor) {
    return (
      <PageShell
        eyebrow={dictionary.routes.items.dashboard.label}
        title={dictionary.dashboardPage.guardedTitle}
        description={dictionary.dashboardPage.guardedDescription}
        actions={<LocaleSwitcher locale={locale} nextPath="/dashboard" dictionary={dictionary} />}
      >
        <SectionCard title={dictionary.dashboardPage.signInTitle} eyebrow={dictionary.dashboardPage.signInEyebrow}>
          <p className="text-sm text-muted-foreground">{dictionary.dashboardPage.guardedDescription}</p>
          <form action={signInDemoAuthorAction} className="mt-4">
            <input name="next" type="hidden" value="/dashboard" />
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
  const rooms = app.listActiveRooms(actor);

  return (
    <PageShell
      eyebrow={dictionary.routes.items.dashboard.label}
      title={dictionary.dashboardPage.title}
      description={dictionary.dashboardPage.description}
      actions={<LocaleSwitcher locale={locale} nextPath="/dashboard" dictionary={dictionary} />}
    >
      {(notice || error) && (
        <SectionCard
          title={error ? dictionary.dashboardPage.errorTitle : dictionary.dashboardPage.readyTitle}
          eyebrow={error ? dictionary.dashboardPage.errorEyebrow : dictionary.dashboardPage.readyEyebrow}
        >
          <p className="text-sm text-muted-foreground">{error ?? notice}</p>
        </SectionCard>
      )}

      <div className="flex flex-wrap gap-3">
        <Button asChild className="h-10 rounded-full px-4" variant="outline">
          <Link href="/authoring">{dictionary.dashboardPage.openAuthoring}</Link>
        </Button>
        <form action={signOutDemoAuthorAction}>
          <Button className="h-10 rounded-full px-4" type="submit" variant="outline">
            {dictionary.landing.exitDemoAuthorSession}
          </Button>
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {quizzes.map((quiz) => (
          <SectionCard
            key={quiz.quiz_id}
            title={quiz.title}
            eyebrow={`${dictionary.appLabels.quizPrefix} · ${formatQuizStatus(dictionary, quiz.status)}`}
          >
            <dl className="space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground/70">{dictionary.appLabels.questionCountLabel}</dt>
                <dd>{quiz.question_count}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground/70">{dictionary.appLabels.updatedLabel}</dt>
                <dd>{quiz.updated_at}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild className="h-10 rounded-full px-4" variant="outline">
                <Link href={`/authoring?quizId=${quiz.quiz_id}` as Route}>{dictionary.dashboardPage.editQuiz}</Link>
              </Button>
              {quiz.status === 'draft' ? (
                <form action={publishQuizAction}>
                  <input name="quizId" type="hidden" value={quiz.quiz_id} />
                  <Button className="h-10 rounded-full px-4" type="submit">
                    {dictionary.dashboardPage.publishDraft}
                  </Button>
                </form>
              ) : (
                <form action={createRoomAction}>
                  <input name="quizId" type="hidden" value={quiz.quiz_id} />
                  <Button className="h-10 rounded-full px-4" type="submit">
                    {dictionary.dashboardPage.createHostRoom}
                  </Button>
                </form>
              )}
            </div>
          </SectionCard>
        ))}
      </div>

      <SectionCard title={dictionary.dashboardPage.hostedRoomsTitle} eyebrow={dictionary.dashboardPage.hostedRoomsEyebrow}>
        {rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">{dictionary.dashboardPage.noRooms}</p>
        ) : (
          <ul className="space-y-3 text-sm text-muted-foreground">
            {rooms.map((room) => (
              <li key={room.room_code} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-background/40 px-4 py-3">
                <span>
                  {room.room_code} · {formatRoomLifecycle(dictionary, room.lifecycle_state)} · {dictionary.appLabels.joinedPlayersLabel}:{' '}
                  {room.joined_player_count}
                </span>
                <Button asChild className="h-auto px-0 text-sky-200" variant="link">
                  <Link href={`/host?roomCode=${room.room_code}` as Route}>{dictionary.dashboardPage.openHostRoom}</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}