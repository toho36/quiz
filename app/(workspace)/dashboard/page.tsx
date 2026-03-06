import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';

export default function DashboardPage() {
  return (
    <PageShell
      eyebrow="Dashboard"
      title="Author dashboard entry point"
      description="Reserved for Clerk-protected author views. Ownership checks and quiz mutations will stay in the Next.js server boundary."
    >
      <SectionCard title="Planned capabilities" eyebrow="Server boundary">
        <ul className="space-y-2 text-sm text-slate-300">
          <li>Clerk-authenticated dashboard shell</li>
          <li>Quiz listing, status, and publish actions</li>
          <li>Server-side ownership checks before any mutation</li>
        </ul>
      </SectionCard>
    </PageShell>
  );
}