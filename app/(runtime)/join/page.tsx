import { PageShell } from '@/components/page-shell';
import { JoinRoomForm } from '@/components/join-room-form';
import { SectionCard } from '@/components/section-card';
import { Badge } from '@/components/ui/badge';
import { getPublicRuntimeConfig } from '@/lib/env/public';

export const dynamic = 'force-dynamic';

function getValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

type JoinSearchParams = Promise<{ roomCode?: string; error?: string }>;

export default async function JoinPage({ searchParams }: { searchParams: JoinSearchParams }) {
  const config = getPublicRuntimeConfig();
  const resolvedSearchParams = await searchParams;
  const roomCode = getValue(resolvedSearchParams.roomCode);
  const error = getValue(resolvedSearchParams.error);

  return (
    <PageShell
      eyebrow="Join"
      title="Step into the room"
      description="Players stay guest-friendly in the MVP, so this entry flow keeps things simple: a room code, a display name, and public-only runtime config."
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full border-border/70 bg-background/75 px-3 py-1 text-[0.7rem] uppercase tracking-[0.24em]">
            Guest-friendly
          </Badge>
          <Badge variant="secondary" className="rounded-full bg-secondary/15 px-3 py-1 text-secondary-foreground">
            Env · {config.environment}
          </Badge>
        </div>
      }
      aside={
        <SectionCard
          title="Fast lane"
          eyebrow="2-step entry"
          description="Everything here stays on the browser-safe side of the app boundary."
        >
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
              <p className="font-medium text-foreground">1. Enter the room code</p>
              <p className="mt-1 leading-6">Use the code shared by the host to target the right live room.</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
              <p className="font-medium text-foreground">2. Pick your display name</p>
              <p className="mt-1 leading-6">That room-scoped identity follows you through the play view and leaderboard.</p>
            </div>
          </div>
        </SectionCard>
      }
    >
      {error && (
        <SectionCard title="Join blocked" eyebrow="Runtime validation" description="The flow is unchanged, but the runtime validator rejected the latest request.">
          <p className="text-sm text-muted-foreground">{error}</p>
        </SectionCard>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
        <JoinRoomForm roomCode={roomCode} />
        <SectionCard
          title="Client-safe config"
          eyebrow="Public env only"
          description="This route only reads browser-safe configuration and never pulls server secrets into the player surface."
        >
          <dl className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Environment</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">{config.environment}</dd>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Runtime endpoint</dt>
              <dd className="mt-1 break-words text-sm font-medium text-foreground">{config.spacetimeEndpoint ?? 'Not configured yet'}</dd>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">Server secrets</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">Never imported into this route.</dd>
            </div>
          </dl>
        </SectionCard>
      </div>
    </PageShell>
  );
}