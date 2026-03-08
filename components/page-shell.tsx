import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6 md:space-y-8">
      <Card className="shell-panel relative overflow-hidden rounded-[2rem] border-border/70 py-0">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_oklch(var(--primary)/0.22),_transparent_34%),radial-gradient(circle_at_bottom_right,_oklch(var(--secondary)/0.2),_transparent_30%),radial-gradient(circle_at_center,_oklch(var(--accent)/0.14),_transparent_42%)]" />
        <div className="pointer-events-none absolute inset-x-8 top-0 h-24 rounded-b-[2rem] bg-gradient-to-r from-primary/18 via-secondary/10 to-accent/12 blur-2xl" />
        <CardContent
          className={cn(
            'relative grid gap-8 px-6 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10',
            aside ? 'lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end' : undefined,
          )}
        >
          <div className="space-y-5">
            <Badge variant="outline" className="shell-badge w-fit">
              {eyebrow}
            </Badge>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">{title}</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">{description}</p>
            </div>
            {actions ? <div className="space-y-3">{actions}</div> : null}
          </div>
          {aside ? <div className="relative">{aside}</div> : null}
        </CardContent>
        <div className="px-6 pb-6 sm:px-8 sm:pb-8 lg:px-10 lg:pb-10">
          <Separator className="bg-border/80" />
        </div>
      </Card>
      <div className="space-y-6">{children}</div>
    </section>
  );
}