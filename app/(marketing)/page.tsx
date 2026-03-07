import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { CLERK_SIGN_IN_PATH, getProtectedAuthorState } from '@/lib/server/author-auth';
import { appRoutes } from '@/lib/shared/routes';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const authorState = await getProtectedAuthorState();

  return (
    <PageShell
      eyebrow="Landing"
      title="Quiz MVP initial application flows"
      description="This starter keeps guest play lightweight while protected dashboard, authoring, and host flows resolve identity on the server through Clerk-backed auth."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Author flow" eyebrow="Guarded workspace">
          <p className="text-sm text-muted-foreground">
            Enter the protected dashboard, edit a draft quiz, publish it, and create a host room from the server boundary.
          </p>
          {authorState.status === 'authenticated' ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild className="h-10 rounded-full px-4">
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
            </div>
          ) : authorState.status === 'unauthenticated' ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild className="h-10 rounded-full px-4">
                <Link href={CLERK_SIGN_IN_PATH}>Sign in with Clerk</Link>
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p>
                {authorState.status === 'setup-required'
                  ? authorState.message
                  : 'Sign in with Clerk to continue once the protected author flow is enabled.'}
              </p>
              {authorState.status === 'setup-required' && authorState.missingEnvKeys.length > 0 ? (
                <p>Missing env: {authorState.missingEnvKeys.join(', ')}</p>
              ) : null}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Player flow" eyebrow="Room-scoped runtime">
          <p className="text-sm text-muted-foreground">
            Join a room with a display name, then play through the current runtime question state and leaderboard.
          </p>
          <Button asChild className="mt-4 h-10 rounded-full px-4" variant="outline">
            <Link href="/join">Open join flow</Link>
          </Button>
        </SectionCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {appRoutes.map((route) => (
          <SectionCard key={route.href} title={route.label} eyebrow={route.section}>
            <p className="text-sm text-muted-foreground">{route.description}</p>
            <Button asChild className="mt-4 h-auto px-0 text-sky-200" variant="link">
              <Link href={route.href}>Open route →</Link>
            </Button>
          </SectionCard>
        ))}
      </div>
    </PageShell>
  );
}