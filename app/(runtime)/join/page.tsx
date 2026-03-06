import { PageShell } from '@/components/page-shell';
import { JoinRoomForm } from '@/components/join-room-form';
import { SectionCard } from '@/components/section-card';
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
      title="Player join entry point"
      description="Players stay guest-friendly in the MVP. The browser only sees public config and room-scoped session material."
    >
      {error && (
        <SectionCard title="Join blocked" eyebrow="Runtime validation">
          <p className="text-sm text-slate-300">{error}</p>
        </SectionCard>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <JoinRoomForm roomCode={roomCode} />
        <SectionCard title="Client-safe config" eyebrow="Public env only">
          <dl className="space-y-3 text-sm text-slate-300">
            <div>
              <dt className="text-slate-500">Environment</dt>
              <dd>{config.environment}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Runtime endpoint</dt>
              <dd>{config.spacetimeEndpoint ?? 'Not configured yet'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Server secrets</dt>
              <dd>Never imported into this route.</dd>
            </div>
          </dl>
        </SectionCard>
      </div>
    </PageShell>
  );
}