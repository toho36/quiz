import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export function PageShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <Badge
          variant="outline"
          className="w-fit rounded-full border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-sky-100"
        >
          {eyebrow}
        </Badge>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{title}</h1>
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">{description}</p>
        </div>
        <Separator className="bg-border/80" />
      </div>
      {children}
    </section>
  );
}