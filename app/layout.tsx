import { ClerkProvider } from '@clerk/nextjs';
import Link from 'next/link';
import './globals.css';
import { getClerkEnvStatus } from '@/lib/env/clerk';
import { getPublicRuntimeConfig } from '@/lib/env/public';
import { getLocaleContext } from '@/lib/i18n/server';
import { getPrimaryRoutes } from '@/lib/shared/routes';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

function AppProviders({ children, clerkPublishableKey }: { children: React.ReactNode; clerkPublishableKey: string | null }) {
  if (!clerkPublishableKey) {
    return <>{children}</>;
  }

  return <ClerkProvider publishableKey={clerkPublishableKey}>{children}</ClerkProvider>;
}

export const metadata = {
  title: 'Quiz',
  description: 'Foundation shell for the Quiz MVP.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = getPublicRuntimeConfig();
  const { locale, dictionary } = await getLocaleContext();
  const primaryRoutes = getPrimaryRoutes(dictionary.routes);
  const clerk = getClerkEnvStatus();
  const app = (
    <html lang={locale} className={cn('dark', 'font-sans', geist.variable)}>
      <body>
        <div className="min-h-screen bg-canvas">
          <header className="border-b border-border bg-slate-950/80 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
              <div>
                <Link className="text-lg font-semibold text-white" href="/">
                  {dictionary.layout.brandTitle}
                </Link>
                <p className="text-sm text-slate-400">
                  {dictionary.layout.brandDescription}
                </p>
              </div>
              <nav className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                {primaryRoutes.map((route) => (
                  <Link key={route.href} className="hover:text-white" href={route.href}>
                    {route.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="border-t border-border bg-slate-950/60 px-6 py-2 text-xs text-slate-400">
              <div className="mx-auto flex max-w-6xl justify-between gap-3">
                <span>
                  {dictionary.layout.environmentLabel}: {config.environment}
                </span>
                <span>{dictionary.layout.runtimeBoundaryNotice}</span>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        </div>
      </body>
    </html>
  );

  return <AppProviders clerkPublishableKey={clerk.isConfigured ? clerk.publishableKey : null}>{app}</AppProviders>;
}