import Link from 'next/link';
import { createRoomAction, publishQuizAction } from '@/app/actions';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { formatQuizStatus, formatRoomLifecycle } from '@/lib/i18n/app-shell';
import { getLocaleContext } from '@/lib/i18n/server';
import { getAppOperationalReadiness, getAppService } from '@/lib/server/app-service';
import { CLERK_SIGN_IN_PATH, getProtectedAuthorState } from '@/lib/server/author-auth';

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
        eyebrow={dictionary.routes.items.dashboard.label}
        title={dictionary.dashboardPage.guardedTitle}
        description={dictionary.dashboardPage.guardedDescription}
        actions={<LocaleSwitcher locale={locale} nextPath="/dashboard" dictionary={dictionary} />}
      >
        <SectionCard title={dictionary.dashboardPage.signInTitle} eyebrow={dictionary.dashboardPage.signInEyebrow}>
          {authorState.status === 'unauthenticated' ? (
            <div className="mt-4">
              <Button asChild className="h-10 rounded-full px-4">
                <Link href={CLERK_SIGN_IN_PATH}>{dictionary.dashboardPage.signInTitle}</Link>
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
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
        eyebrow={dictionary.routes.items.dashboard.label}
        title={dictionary.dashboardPage.guardedTitle}
        description={dictionary.dashboardPage.guardedDescription}
        actions={<LocaleSwitcher locale={locale} nextPath="/dashboard" dictionary={dictionary} />}
      >
        <SectionCard title={dictionary.dashboardPage.errorTitle} eyebrow={dictionary.dashboardPage.errorEyebrow}>
          <p className="text-sm text-muted-foreground">Missing env: {readiness.authoring.missingKeys.join(', ')}</p>
        </SectionCard>
      </PageShell>
    );
  }

  const app = getAppService();
  const quizzes = await app.listQuizSummaries(actor);
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

      {!readiness.canBootstrapRooms && (
        <SectionCard title={dictionary.dashboardPage.errorTitle} eyebrow={dictionary.dashboardPage.errorEyebrow}>
          <p className="text-sm text-muted-foreground">Missing env: {readiness.runtime.missing.join(', ')}</p>
        </SectionCard>
      )}

      <div className="flex flex-wrap gap-3">
        <Button asChild className="h-10 rounded-full px-4" variant="outline">
          <Link href={{ pathname: '/authoring' }}>{dictionary.dashboardPage.openAuthoring}</Link>
        </Button>
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
                <Link href={{ pathname: '/authoring', query: { quizId: quiz.quiz_id } }}>{dictionary.dashboardPage.editQuiz}</Link>
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
                  <Button className="h-10 rounded-full px-4" disabled={!readiness.canBootstrapRooms} type="submit">
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
                <Button asChild className="h-auto px-0 text-primary" variant="link">
                  <Link href={{ pathname: '/host', query: { roomCode: room.room_code } }}>{dictionary.dashboardPage.openHostRoom}</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}