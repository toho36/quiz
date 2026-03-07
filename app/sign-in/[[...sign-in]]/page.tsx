import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { getClerkEnvStatus } from '@/lib/env/clerk';

export const dynamic = 'force-dynamic';

export default function SignInPage() {
  const clerk = getClerkEnvStatus();

  if (!clerk.isConfigured) {
    return (
      <PageShell eyebrow="Auth" title="Clerk sign-in setup is incomplete" description="Add the required Clerk env before enabling the protected author flow.">
        <SectionCard title="Missing Clerk configuration" eyebrow="Protected author flow">
          <p className="text-sm text-muted-foreground">Missing env: {clerk.missingKeys.join(', ')}</p>
          <div className="mt-4">
            <Button asChild className="h-10 rounded-full px-4" variant="outline">
              <Link href="/">Return home</Link>
            </Button>
          </div>
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Auth" title="Sign in" description="Authenticate with Clerk to unlock the protected authoring and host flows.">
      <SectionCard title="Author sign-in" eyebrow="Protected author flow">
        <SignIn />
      </SectionCard>
    </PageShell>
  );
}