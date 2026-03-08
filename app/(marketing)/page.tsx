import Link from 'next/link';
import { signInDemoAuthorAction, signOutDemoAuthorAction } from '@/app/actions';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { getLocaleContext } from '@/lib/i18n/server';
import { getDemoAuthorActor } from '@/lib/server/demo-session';
import { getAppRoutes, getRouteSectionLabel } from '@/lib/shared/routes';

export default async function LandingPage() {
  const [actor, { locale, dictionary }] = await Promise.all([getDemoAuthorActor(), getLocaleContext()]);
  const appRoutes = getAppRoutes(dictionary.routes);

  return (
    <PageShell
      eyebrow={dictionary.landing.eyebrow}
      title={dictionary.landing.title}
      description={dictionary.landing.description}
      actions={<LocaleSwitcher locale={locale} nextPath="/" dictionary={dictionary} />}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={dictionary.landing.authorFlowTitle} eyebrow={dictionary.landing.authorFlowEyebrow}>
          <p className="text-sm text-muted-foreground">
            {dictionary.landing.authorFlowDescription}
          </p>
          {actor ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild className="h-10 rounded-full px-4">
                <Link href="/dashboard">{dictionary.landing.openDashboard}</Link>
              </Button>
              <form action={signOutDemoAuthorAction}>
                <Button className="h-10 rounded-full px-4" type="submit" variant="outline">
                  {dictionary.landing.exitDemoAuthorSession}
                </Button>
              </form>
            </div>
          ) : (
            <form action={signInDemoAuthorAction} className="mt-4">
              <input name="next" type="hidden" value="/dashboard" />
              <Button className="h-10 rounded-full px-4" type="submit">
                {dictionary.landing.continueAsDemoAuthor}
              </Button>
            </form>
          )}
        </SectionCard>

        <SectionCard title={dictionary.landing.playerFlowTitle} eyebrow={dictionary.landing.playerFlowEyebrow}>
          <p className="text-sm text-muted-foreground">
            {dictionary.landing.playerFlowDescription}
          </p>
          <Button asChild className="mt-4 h-10 rounded-full px-4" variant="outline">
            <Link href="/join">{dictionary.landing.openJoinFlow}</Link>
          </Button>
        </SectionCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {appRoutes.map((route) => (
          <SectionCard key={route.href} title={route.label} eyebrow={getRouteSectionLabel(dictionary.routes, route.section)}>
            <p className="text-sm text-muted-foreground">{route.description}</p>
            <Button asChild className="mt-4 h-auto px-0 text-sky-200" variant="link">
              <Link href={route.href}>{dictionary.landing.openRoute}</Link>
            </Button>
          </SectionCard>
        ))}
      </div>
    </PageShell>
  );
}