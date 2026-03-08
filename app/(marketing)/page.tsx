import Link from 'next/link';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { getLocaleContext } from '@/lib/i18n/server';
import { CLERK_SIGN_IN_PATH, getProtectedAuthorState } from '@/lib/server/author-auth';
import { getAppRoutes, getRouteSectionLabel } from '@/lib/shared/routes';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const [authorState, { locale, dictionary }] = await Promise.all([getProtectedAuthorState(), getLocaleContext()]);
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
          <p className="text-sm text-muted-foreground">{dictionary.landing.authorFlowDescription}</p>
          {authorState.status === 'authenticated' ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild className="h-10 rounded-full px-4">
                <Link href="/dashboard">{dictionary.landing.openDashboard}</Link>
              </Button>
            </div>
          ) : authorState.status === 'unauthenticated' ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild className="h-10 rounded-full px-4">
                <Link href={CLERK_SIGN_IN_PATH}>{dictionary.dashboardPage.signInTitle}</Link>
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p>{authorState.status === 'setup-required' ? authorState.message : dictionary.dashboardPage.guardedDescription}</p>
              {authorState.status === 'setup-required' && authorState.missingEnvKeys.length > 0 ? (
                <p>Missing env: {authorState.missingEnvKeys.join(', ')}</p>
              ) : null}
            </div>
          )}
        </SectionCard>

        <SectionCard title={dictionary.landing.playerFlowTitle} eyebrow={dictionary.landing.playerFlowEyebrow}>
          <p className="text-sm text-muted-foreground">{dictionary.landing.playerFlowDescription}</p>
          <Button asChild className="mt-4 h-10 rounded-full px-4" variant="outline">
            <Link href="/join">{dictionary.landing.openJoinFlow}</Link>
          </Button>
        </SectionCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {appRoutes.map((route) => (
          <SectionCard key={route.href} title={route.label} eyebrow={getRouteSectionLabel(dictionary.routes, route.section)}>
            <p className="text-sm text-muted-foreground">{route.description}</p>
            <Button asChild className="mt-4 h-auto px-0 text-primary" variant="link">
              <Link href={route.href}>{dictionary.landing.openRoute}</Link>
            </Button>
          </SectionCard>
        ))}
      </div>
    </PageShell>
  );
}