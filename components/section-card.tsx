import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function SectionCard({
  title,
  eyebrow,
  description,
  action,
  className,
  contentClassName,
  children,
}: {
  title: string;
  eyebrow: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn('shell-card relative gap-0 rounded-[2rem] border-border/70 py-0', className)}>
      <div className="pointer-events-none absolute inset-x-6 top-0 h-20 rounded-b-[2rem] bg-gradient-to-r from-primary/12 via-secondary/10 to-accent/10 blur-2xl" />
      <CardHeader className="relative gap-3 border-b border-border/70 pb-5 pt-5 sm:pb-6 sm:pt-6">
        <Badge variant="outline" className="shell-badge w-fit">
          {eyebrow}
        </Badge>
        {action ? <CardAction className="pt-1">{action}</CardAction> : null}
        <CardTitle className="text-xl font-semibold tracking-tight text-foreground sm:text-[1.35rem]">{title}</CardTitle>
        {description ? <CardDescription className="max-w-2xl leading-6">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={cn('relative pt-5 pb-5 sm:pt-6 sm:pb-6', contentClassName)}>{children}</CardContent>
    </Card>
  );
}