import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getPublicRuntimeConfig } from '@/lib/env/public';
import { primaryRoutes } from '@/lib/shared/routes';

export const metadata: Metadata = {
  title: 'Quiz',
  description: 'Foundation shell for the Quiz MVP.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const config = getPublicRuntimeConfig();

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-canvas">
          <header className="border-b border-border bg-slate-950/80 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
              <div>
                <Link className="text-lg font-semibold text-white" href="/">
                  Quiz foundation
                </Link>
                <p className="text-sm text-slate-400">
                  Bun + Next.js App Router + Tailwind baseline for the MVP.
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
                <span>Environment: {config.environment}</span>
                <span>Client-safe runtime endpoint only; privileged credentials stay server-only.</span>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        </div>
      </body>
    </html>
  );
}