import { ClerkProvider } from '@clerk/nextjs';
import { Geist } from 'next/font/google';
import Link from 'next/link';
import Script from 'next/script';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getClerkEnvStatus } from '@/lib/env/clerk';
import { getPublicRuntimeConfig } from '@/lib/env/public';
import { getLocaleContext } from '@/lib/i18n/server';
import { getPrimaryRoutes } from '@/lib/shared/routes';
import { getThemeScript } from '@/lib/theme';
import { cn } from '@/lib/utils';
import './globals.css';

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
    <html lang={locale} suppressHydrationWarning className={cn('font-sans', geist.variable)}>
      <body className="theme">
        <Script id="theme-script" strategy="beforeInteractive">
          {getThemeScript()}
        </Script>
        <div className="app-shell min-h-screen">
          <div className="relative z-10 flex min-h-screen flex-col">
            <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-2xl">
              <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-3">
                    <Badge variant="outline" className="shell-badge w-fit">
                      {dictionary.layout.environmentLabel}: {config.environment}
                    </Badge>
                    <div className="space-y-2">
                      <Link className="inline-flex items-center gap-3 text-xl font-semibold tracking-tight text-foreground" href="/">
                        <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-lg shadow-primary/15 ring-1 ring-primary/20">
                          Q
                        </span>
                        {dictionary.layout.brandTitle}
                      </Link>
                      <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                        {dictionary.layout.brandDescription}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <ThemeToggle />
                  </div>
                </div>
                <nav className="flex flex-wrap gap-2">
                  {primaryRoutes.map((route) => (
                    <Button
                      key={route.href}
                      asChild
                      variant="outline"
                      size="sm"
                      className="shell-pill rounded-full border-border/70 bg-background/70 px-4"
                    >
                      <Link href={route.href}>{route.label}</Link>
                    </Button>
                  ))}
                </nav>
              </div>
              <div className="border-t border-border/60 bg-background/45 px-4 py-2 sm:px-6">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{dictionary.layout.environmentLabel}: {config.environment}</span>
                  <span>{dictionary.layout.runtimeBoundaryNotice}</span>
                </div>
              </div>
            </header>
            <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );

  return <AppProviders clerkPublishableKey={clerk.isConfigured ? clerk.publishableKey : null}>{app}</AppProviders>;
}