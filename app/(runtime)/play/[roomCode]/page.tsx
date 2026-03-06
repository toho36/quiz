import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';

export default function PlayPage({ params }: { params: { roomCode: string } }) {
  const roomCode = params.roomCode.toUpperCase();

  return (
    <PageShell
      eyebrow="Play"
      title={`Runtime shell for room ${roomCode}`}
      description="Reserved for reducer-backed player state, timer, and leaderboard subscriptions once the runtime integration lands."
    >
      <SectionCard title="Planned runtime rules" eyebrow="Reducer authority">
        <ul className="space-y-2 text-sm text-slate-300">
          <li>Join and reconnect stay room-scoped.</li>
          <li>Correctness, scoring, and deadlines remain server-authoritative.</li>
          <li>Late join during active play is intentionally out of scope for the MVP.</li>
        </ul>
      </SectionCard>
    </PageShell>
  );
}