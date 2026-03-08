import { SectionNav } from '@/components/section-nav';
import { getLocaleContext } from '@/lib/i18n/server';
import { getWorkspaceRoutes } from '@/lib/shared/routes';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { dictionary } = await getLocaleContext();
  const workspaceRoutes = getWorkspaceRoutes(dictionary.routes);

  return (
    <div className="space-y-8">
      <SectionNav
        badge={dictionary.routes.sections.workspace}
        title={dictionary.routes.sections.workspace}
        description={dictionary.authoringPage.description}
        routes={workspaceRoutes}
      />
      {children}
    </div>
  );
}