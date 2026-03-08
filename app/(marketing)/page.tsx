import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight, LayoutGrid, PenTool, PlayCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CLERK_SIGN_IN_PATH, getProtectedAuthorState } from '@/lib/server/author-auth';
import { appRoutes } from '@/lib/shared/routes';

export const dynamic = 'force-dynamic';

const experienceLanes = [
  {
    title: 'Shape the set',
    description: 'Tune quiz details and prep the hosting moment without leaving the playful shell.',
    icon: PenTool,
    accentClassName: 'bg-primary/12 text-primary ring-1 ring-primary/20',
  },
  {
    title: 'Run the room',
    description: 'Move from publish to room controls with clear, server-owned flow boundaries.',
    icon: ShieldCheck,
    accentClassName: 'bg-secondary/12 text-secondary-foreground ring-1 ring-secondary/20',
  },
  {
    title: 'Welcome players',
    description: 'Get guests from join code to live questions with less friction and more energy.',
    icon: PlayCircle,
    accentClassName: 'bg-accent/16 text-accent-foreground ring-1 ring-accent/20',
  },
] as const;

const designPrompts = [
  'Server-owned auth and authoring stay intact under the new presentation layer.',
  'Color cues and layered cards keep light and dark mode feeling equally vivid.',
  'Public, workspace, and runtime routes remain one tap away from the landing page.',
] as const;

const playerMoments = [
  'Join with a display name and room code.',
  'See the current question state without extra setup.',
  'Stay oriented as the room moves toward reveal and leaderboard.',
] as const;

const routeStageLabels: Record<string, string> = {
  public: 'Start here',
  workspace: 'Create',
  runtime: 'Go live',
};

export default async function LandingPage() {
  const authorState = await getProtectedAuthorState();
  const authorCta: { href: Route; label: string } | null =
    authorState.status === 'authenticated'
      ? { href: '/dashboard', label: 'Open dashboard' }
      : authorState.status === 'unauthenticated'
        ? { href: CLERK_SIGN_IN_PATH, label: 'Sign in with Clerk' }
        : null;
  const authorStatusLabel =
    authorState.status === 'authenticated'
      ? 'Author access ready'
      : authorState.status === 'unauthenticated'
        ? 'Protected author flow'
        : 'Setup guidance';

  return (
    <PageShell
      eyebrow="Landing"
      title="Bring your next quiz night to life"
      description="Launch the app from a brighter front door: authoring stays protected on the server, host controls stay clear, and players get a fast path into the room in both light and dark mode."
      actions={
        <>
          <div className="flex flex-wrap gap-3">
            {authorCta ? (
              <Button asChild className="h-11 rounded-full px-5 shadow-lg shadow-primary/20">
                <Link href={authorCta.href}>
                  {authorCta.label}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/10 px-4 py-2 text-xs text-foreground">
                {authorStatusLabel}
              </Badge>
            )}
            <Button asChild variant="outline" className="h-11 rounded-full border-border/70 bg-background/75 px-5">
              <Link href="/join">Open join flow</Link>
            </Button>
            <Badge variant="outline" className="rounded-full border-secondary/30 bg-secondary/10 px-4 py-2 text-xs text-foreground">
              {authorStatusLabel}
            </Badge>
          </div>
          {authorState.status === 'setup-required' ? (
            <p className="text-sm leading-6 text-muted-foreground">
              {authorState.message}
              {authorState.missingEnvKeys.length > 0 ? ` Missing env: ${authorState.missingEnvKeys.join(', ')}` : ''}
            </p>
          ) : null}
        </>
      }
      aside={
        <Card className="shell-card relative overflow-hidden rounded-[2rem] border-border/70 py-0">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_oklch(var(--secondary)/0.18),_transparent_40%),radial-gradient(circle_at_bottom_right,_oklch(var(--accent)/0.18),_transparent_42%)]" />
          <CardContent className="relative space-y-4 p-6">
            <div className="flex items-center justify-between gap-3">
              <Badge variant="outline" className="shell-badge w-fit">
                Experience lanes
              </Badge>
              <Sparkles className="size-4 text-primary" />
            </div>
            <div className="space-y-3">
              {experienceLanes.map((lane) => {
                const Icon = lane.icon;

                return (
                  <div key={lane.title} className="rounded-[1.5rem] border border-border/70 bg-background/70 p-4 backdrop-blur-xl">
                    <div className="flex items-start gap-3">
                      <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-2xl ${lane.accentClassName}`}>
                        <Icon className="size-4" />
                      </span>
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">{lane.title}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{lane.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          title="Design the set, not the plumbing"
          eyebrow="Author flow"
          description="The Wave 1 shell now opens with a more expressive launchpad while the protected dashboard and authoring workspace keep the core business logic exactly where it already lives."
          action={
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-foreground">
              <LayoutGrid className="size-3.5 text-primary" />
              Shared shell
            </span>
          }
        >
          <ul className="grid gap-3 sm:grid-cols-2">
            {designPrompts.map((prompt) => (
              <li key={prompt} className="rounded-[1.5rem] border border-border/70 bg-background/65 px-4 py-3 text-sm leading-6 text-muted-foreground">
                {prompt}
              </li>
            ))}
          </ul>
          {authorCta ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild variant="secondary" className="h-10 rounded-full px-4">
                <Link href={authorCta.href}>{authorCta.label}</Link>
              </Button>
              <Button asChild variant="outline" className="h-10 rounded-full px-4">
                <Link href="/authoring">Peek at authoring</Link>
              </Button>
            </div>
          ) : authorState.status === 'setup-required' ? (
            <div className="mt-5 rounded-[1.5rem] border border-border/70 bg-background/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
              {authorState.message}
              {authorState.missingEnvKeys.length > 0 ? ` Missing env: ${authorState.missingEnvKeys.join(', ')}` : ''}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Drop players straight into the fun"
          eyebrow="Player flow"
          description="Use the same runtime routes, but present them with clearer pacing, friendlier hierarchy, and richer visual rhythm before guests ever reach the room."
          action={
            <span className="inline-flex items-center gap-2 rounded-full border border-secondary/20 bg-secondary/10 px-3 py-1 text-xs font-medium text-foreground">
              <PlayCircle className="size-3.5 text-secondary-foreground" />
              Guest-ready
            </span>
          }
        >
          <div className="space-y-3">
            {playerMoments.map((moment, index) => (
              <div key={moment} className="flex items-start gap-3 rounded-[1.5rem] border border-border/70 bg-background/65 px-4 py-3 text-sm leading-6 text-muted-foreground">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent-foreground">
                  {index + 1}
                </span>
                <span>{moment}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild className="h-10 rounded-full px-4">
              <Link href="/join">Open join flow</Link>
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-full px-4">
              <Link href="/host">Preview host room</Link>
            </Button>
          </div>
        </SectionCard>
      </div>

      <section className="shell-panel rounded-[2rem] p-5 sm:p-6">
        <div className="space-y-3">
          <Badge variant="outline" className="shell-badge w-fit">
            Route guide
          </Badge>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Preview every surface in the journey</h2>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
              Jump between the public, workspace, and runtime routes without changing any underlying flow contracts. This is a presentation refresh, not a navigation rewrite.
            </p>
          </div>
        </div>
        <Separator className="my-5 bg-border/70" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {appRoutes.map((route, index) => (
            <SectionCard
              key={route.href}
              title={route.label}
              eyebrow={`${route.section} · ${routeStageLabels[route.section] ?? 'Explore'}`}
              description={route.description}
              action={<span className="text-xs font-medium text-muted-foreground">0{index + 1}</span>}
              contentClassName="space-y-4"
            >
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full border-border/70 bg-background/70 text-[0.65rem] uppercase tracking-[0.2em] text-foreground">
                  {route.href}
                </Badge>
                <Badge variant="outline" className="rounded-full border-accent/20 bg-accent/10 text-[0.65rem] uppercase tracking-[0.2em] text-foreground">
                  {routeStageLabels[route.section] ?? 'Explore'}
                </Badge>
              </div>
              <Button asChild className="h-10 rounded-full px-4" variant={route.href === '/join' ? 'secondary' : 'outline'}>
                <Link href={route.href}>
                  Open route
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </SectionCard>
          ))}
        </div>
      </section>
    </PageShell>
  );
}