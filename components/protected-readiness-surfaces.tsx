import type { Route } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import type { ProtectedAuthorState } from '@/lib/server/author-auth';

type GuardAuthorState = Exclude<ProtectedAuthorState, { status: 'authenticated' }>;

export function DashboardProtectedGuardSurface({ authorState, signInPath }: { authorState: GuardAuthorState; signInPath: Route }) {
  return (
    <PageShell
      eyebrow="Dashboard"
      title="Author dashboard is guarded"
      description="This route now expects Clerk-backed server auth before protected authoring or runtime bootstrap actions can run."
    >
      <SectionCard title="Clerk integration required" eyebrow="Protected author flow">
        <p className="text-sm text-muted-foreground">{authorState.status === 'setup-required' ? authorState.message : 'Sign in with Clerk to continue.'}</p>
        {authorState.status === 'unauthenticated' ? <div className="mt-4"><Button asChild className="h-10 rounded-full px-4"><Link href={signInPath}>Open sign-in</Link></Button></div> : null}
        {authorState.status === 'setup-required' && authorState.missingEnvKeys.length > 0 ? <p className="mt-3 text-sm text-muted-foreground">Missing env: {authorState.missingEnvKeys.join(', ')}</p> : null}
      </SectionCard>
    </PageShell>
  );
}

export function DashboardAuthoringReadinessSurface({ missingEnvKeys }: { missingEnvKeys: string[] }) {
  return (
    <PageShell eyebrow="Dashboard" title="Authoring persistence setup required" description="Protected author routes are using the real SpacetimeDB-backed authoring path by default, so operators need the backing env configured before the dashboard can load quiz data.">
      <SectionCard title="Authoring persistence unavailable" eyebrow="Operator readiness">
        <p className="text-sm text-muted-foreground">Missing env: {missingEnvKeys.join(', ')}</p>
      </SectionCard>
    </PageShell>
  );
}

export function DashboardRuntimeReadinessSurface({ missingEnvKeys }: { missingEnvKeys: string[] }) {
  return <SectionCard title="Runtime bootstrap setup required" eyebrow="Operator readiness"><p className="text-sm text-muted-foreground">Creating new host rooms is blocked until runtime bootstrap env is complete. Missing env: {missingEnvKeys.join(', ')}</p></SectionCard>;
}

export function AuthoringProtectedGuardSurface({ authorState, signInPath }: { authorState: GuardAuthorState; signInPath: Route }) {
  return (
    <PageShell eyebrow="Authoring" title="Authoring requires Clerk-backed auth" description="Quiz edits and publish actions stay on the Next.js server boundary, so this workspace now blocks until the Clerk-backed author guard is wired.">
      <SectionCard title="Clerk integration required" eyebrow="Guard">
        <p className="text-sm text-muted-foreground">{authorState.status === 'setup-required' ? authorState.message : 'Sign in with Clerk to edit quizzes.'}</p>
        {authorState.status === 'unauthenticated' ? <div className="mt-4"><Button asChild className="h-10 rounded-full px-4"><Link href={signInPath}>Open sign-in</Link></Button></div> : null}
        {authorState.status === 'setup-required' && authorState.missingEnvKeys.length > 0 ? <p className="mt-3 text-sm text-muted-foreground">Missing env: {authorState.missingEnvKeys.join(', ')}</p> : null}
      </SectionCard>
    </PageShell>
  );
}

export function AuthoringPersistenceReadinessSurface({ missingEnvKeys }: { missingEnvKeys: string[] }) {
  return (
    <PageShell eyebrow="Authoring" title="Authoring persistence setup required" description="The default authoring workspace now resolves through the SpacetimeDB-backed persistence adapter, so operators need the backing env configured before quiz editing can proceed.">
      <SectionCard title="Authoring persistence unavailable" eyebrow="Operator readiness">
        <p className="text-sm text-muted-foreground">Missing env: {missingEnvKeys.join(', ')}</p>
      </SectionCard>
    </PageShell>
  );
}

export function HostProtectedGuardSurface({ authorState, signInPath }: { authorState: GuardAuthorState; signInPath: Route }) {
  return (
    <PageShell eyebrow="Host" title="Host room access is guarded" description="Creating and managing runtime rooms now expects a verified Clerk-backed author session on the server boundary.">
      <SectionCard title="Clerk integration required" eyebrow="Protected host flow">
        <p className="text-sm text-slate-300">{authorState.status === 'setup-required' ? authorState.message : 'Sign in with Clerk to host a room.'}</p>
        {authorState.status === 'unauthenticated' ? <div className="mt-4"><Button asChild className="h-10 rounded-full px-4"><Link href={signInPath}>Open sign-in</Link></Button></div> : null}
        {authorState.status === 'setup-required' && authorState.missingEnvKeys.length > 0 ? <p className="mt-3 text-sm text-slate-300">Missing env: {authorState.missingEnvKeys.join(', ')}</p> : null}
      </SectionCard>
    </PageShell>
  );
}

export function HostRuntimeReadinessSurface({ missingEnvKeys }: { missingEnvKeys: string[] }) {
  return <SectionCard title="Runtime bootstrap setup required" eyebrow="Operator readiness"><p className="text-sm text-slate-300">New protected host bootstrap is blocked until runtime bootstrap env is complete. Missing env: {missingEnvKeys.join(', ')}</p></SectionCard>;
}