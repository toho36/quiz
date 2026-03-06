import Link from 'next/link';
import { signInDemoAuthorAction, signOutDemoAuthorAction } from '@/app/actions';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { getDemoAuthorActor } from '@/lib/server/demo-session';
import { appRoutes } from '@/lib/shared/routes';

export default async function LandingPage() {
  const actor = await getDemoAuthorActor();

  return (
    <PageShell
      eyebrow="Landing"
      title="Quiz MVP initial application flows"
      description="This starter uses a tiny server-owned demo boundary so the landing, dashboard, authoring, host, join, and play routes exercise the existing services without moving authority into the browser."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Author flow" eyebrow="Guarded workspace">
          <p className="text-sm text-muted-foreground">
            Enter the protected dashboard, edit a draft quiz, publish it, and create a host room from the server boundary.
          </p>
          {actor ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild className="h-10 rounded-full px-4">
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
              <form action={signOutDemoAuthorAction}>
                <Button className="h-10 rounded-full px-4" type="submit" variant="outline">
                  Exit demo author session
                </Button>
              </form>
            </div>
          ) : (
            <form action={signInDemoAuthorAction} className="mt-4">
              <input name="next" type="hidden" value="/dashboard" />
              <Button className="h-10 rounded-full px-4" type="submit">
                Continue as demo author
              </Button>
            </form>
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