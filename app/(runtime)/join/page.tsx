import { LocaleSwitcher } from '@/components/locale-switcher';
import { PageShell } from '@/components/page-shell';
import { JoinRoomForm } from '@/components/join-room-form';
import { SectionCard } from '@/components/section-card';
import { getLocaleContext } from '@/lib/i18n/server';
import { getPublicRuntimeConfig } from '@/lib/env/public';

export const dynamic = 'force-dynamic';

function getValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

type JoinSearchParams = Promise<{ roomCode?: string; error?: string }>;

export default async function JoinPage({ searchParams }: { searchParams: JoinSearchParams }) {
  const config = getPublicRuntimeConfig();
  const [resolvedSearchParams, { locale, dictionary }] = await Promise.all([searchParams, getLocaleContext()]);
  const roomCode = getValue(resolvedSearchParams.roomCode);
  const error = getValue(resolvedSearchParams.error);
  const nextPath = roomCode ? `/join?${new URLSearchParams({ roomCode }).toString()}` : '/join';

  return (
    <PageShell
      eyebrow={dictionary.joinPage.eyebrow}
      title={dictionary.joinPage.title}
      description={dictionary.joinPage.description}
      actions={<LocaleSwitcher locale={locale} nextPath={nextPath} dictionary={dictionary} />}
    >
      {error && (
        <SectionCard title={dictionary.joinPage.errorTitle} eyebrow={dictionary.joinPage.errorEyebrow}>
          <p className="text-sm text-slate-300">{error}</p>
        </SectionCard>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <JoinRoomForm roomCode={roomCode} copy={dictionary.joinForm} />
        <SectionCard title={dictionary.joinPage.configTitle} eyebrow={dictionary.joinPage.configEyebrow}>
          <dl className="space-y-3 text-sm text-slate-300">
            <div>
              <dt className="text-slate-500">{dictionary.joinPage.environmentLabel}</dt>
              <dd>{config.environment}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{dictionary.joinPage.runtimeEndpointLabel}</dt>
              <dd>{config.spacetimeEndpoint ?? dictionary.joinPage.runtimeEndpointMissing}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{dictionary.joinPage.serverSecretsLabel}</dt>
              <dd>{dictionary.joinPage.serverSecretsValue}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>
    </PageShell>
  );
}