import { SectionNav } from '@/components/section-nav';
import { workspaceRoutes } from '@/lib/shared/routes';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-8">
      <SectionNav
        badge="Workspace"
        title="Creative authoring lanes"
        description="Bounce between dashboard orchestration and the quiz workshop while staying inside the same playful studio shell."
        routes={workspaceRoutes}
      />
      {children}
    </div>
  );
}