import Link from 'next/link';
import { SectionCard } from '@/components/section-card';
import { appRoutes } from '@/lib/shared/routes';

export default function LandingPage() {
  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-300">Landing</p>
        <h1 className="text-4xl font-semibold text-white">Quiz app foundation bootstrap</h1>
        <p className="max-w-3xl text-base text-slate-300">
          This shell keeps authoring, room bootstrap, and player runtime flows separate so Clerk and
          SpacetimeDB can be added without leaking private credentials into the browser.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {appRoutes.map((route) => (
          <SectionCard key={route.href} title={route.label} eyebrow={route.section}>
            <p className="text-sm text-slate-300">{route.description}</p>
            <Link className="mt-4 inline-flex text-sm font-medium text-sky-300 hover:text-sky-200" href={route.href}>
              Open route →
            </Link>
          </SectionCard>
        ))}
      </div>
    </section>
  );
}