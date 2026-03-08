import { SectionNav } from '@/components/section-nav';
import { runtimeRoutes } from '@/lib/shared/routes';

export default function RuntimeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-8">
      <SectionNav
        badge="Runtime"
        title="Live room controls"
        description="Move between host, join, and play-ready flows inside the same colorful runtime shell introduced in the earlier waves."
        routes={runtimeRoutes}
      />
      {children}
    </div>
  );
}