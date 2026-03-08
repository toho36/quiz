import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AppRoute } from '@/types/app';

export function SectionNav({
  badge,
  title,
  description,
  routes,
}: {
  badge: string;
  title: string;
  description: string;
  routes: AppRoute[];
}) {
  return (
    <section className="shell-panel rounded-[2rem] p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <Badge variant="outline" className="shell-badge w-fit">
            {badge}
          </Badge>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {routes.map((route) => (
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
        </div>
      </div>
    </section>
  );
}