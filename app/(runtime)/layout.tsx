import { SectionNav } from '@/components/section-nav';
import { getLocaleContext } from '@/lib/i18n/server';
import { getRuntimeRoutes } from '@/lib/shared/routes';

export default async function RuntimeLayout({ children }: { children: React.ReactNode }) {
  const { dictionary } = await getLocaleContext();
  const runtimeRoutes = getRuntimeRoutes(dictionary.routes);

  return (
    <div className="space-y-8">
      <SectionNav
        badge={dictionary.routes.sections.runtime}
        title={dictionary.routes.sections.runtime}
        description={dictionary.hostPage.description}
        routes={runtimeRoutes}
      />
      {children}
    </div>
  );
}