import Link from 'next/link';
import { getLocaleContext } from '@/lib/i18n/server';
import { getRuntimeRoutes } from '@/lib/shared/routes';

export default async function RuntimeLayout({ children }: { children: React.ReactNode }) {
  const { dictionary } = await getLocaleContext();
  const runtimeRoutes = getRuntimeRoutes(dictionary.routes);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 border-b border-border pb-4 text-sm text-slate-300">
        {runtimeRoutes.map((route) => (
          <Link key={route.href} className="rounded-full border border-border px-3 py-1 hover:text-white" href={route.href}>
            {route.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}