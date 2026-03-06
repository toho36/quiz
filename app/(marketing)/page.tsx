import Link from 'next/link';
import { signInDemoAuthorAction, signOutDemoAuthorAction } from '@/app/actions';
import { SectionCard } from '@/components/section-card';
import { getDemoAuthorActor } from '@/lib/server/demo-session';
import { appRoutes } from '@/lib/shared/routes';

export default async function LandingPage() {
  const actor = await getDemoAuthorActor();

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-300">Landing</p>
        <h1 className="text-4xl font-semibold text-white">Quiz MVP initial application flows</h1>
        <p className="max-w-3xl text-base text-slate-300">
          This starter uses a tiny server-owned demo boundary so the landing, dashboard, authoring,
          host, join, and play routes exercise the existing services without moving authority into the browser.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Author flow" eyebrow="Guarded workspace">
          <p className="text-sm text-slate-300">
            Enter the protected dashboard, edit a draft quiz, publish it, and create a host room from the server boundary.
          </p>
          {actor ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950" href="/dashboard">
                Open dashboard
              </Link>
              <form action={signOutDemoAuthorAction}>
                <button className="rounded-full border border-border px-4 py-2 text-sm text-slate-200" type="submit">
                  Exit demo author session
                </button>
              </form>
            </div>
          ) : (
            <form action={signInDemoAuthorAction} className="mt-4">
              <input name="next" type="hidden" value="/dashboard" />
              <button className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">
                Continue as demo author
              </button>
            </form>
          )}
        </SectionCard>

        <SectionCard title="Player flow" eyebrow="Room-scoped runtime">
          <p className="text-sm text-slate-300">
            Join a room with a display name, then play through the current runtime question state and leaderboard.
          </p>
          <Link className="mt-4 inline-flex rounded-full border border-border px-4 py-2 text-sm text-slate-200" href="/join">
            Open join flow
          </Link>
        </SectionCard>
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