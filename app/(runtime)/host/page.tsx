import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { getRuntimeBootstrapReadiness } from '@/lib/server/runtime-bootstrap';

export default function HostPage() {
  const readiness = getRuntimeBootstrapReadiness();

  return (
    <PageShell
      eyebrow="Host"
      title="Host bootstrap entry point"
      description="This server-rendered route is where Clerk-backed room creation and host claim issuance can plug in later."
    >
      <SectionCard title="Bootstrap readiness" eyebrow="Server-only module">
        <ul className="space-y-2 text-sm text-slate-300">
          <li>Room bootstrap configured: {readiness.canCreateRooms ? 'yes' : 'not yet'}</li>
          <li>Host claim signing configured: {readiness.canIssueHostClaims ? 'yes' : 'not yet'}</li>
          <li>Missing keys: {readiness.missing.length > 0 ? readiness.missing.join(', ') : 'none'}</li>
        </ul>
      </SectionCard>
    </PageShell>
  );
}