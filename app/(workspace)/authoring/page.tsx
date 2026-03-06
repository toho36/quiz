import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';

export default function AuthoringPage() {
  return (
    <PageShell
      eyebrow="Authoring"
      title="Authoring workspace entry point"
      description="Authoring remains separate from runtime room state. Future forms and server actions will live here without coupling to live gameplay."
    >
      <SectionCard title="Boundary notes" eyebrow="Authoring vs runtime">
        <ul className="space-y-2 text-sm text-slate-300">
          <li>Authoring data is managed via the Next.js server layer.</li>
          <li>Runtime rooms consume frozen snapshots, not live quiz edits.</li>
          <li>Validation and ownership checks will be shared across forms and APIs.</li>
        </ul>
      </SectionCard>
    </PageShell>
  );
}