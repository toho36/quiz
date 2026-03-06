import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function SectionCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 rounded-3xl border border-border/80 bg-card/95 shadow-2xl shadow-black/15">
      <CardHeader className="gap-3 border-b border-border/70 pb-4">
        <Badge
          variant="outline"
          className="w-fit rounded-full border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-sky-100"
        >
          {eyebrow}
        </Badge>
        <CardTitle className="text-xl font-semibold text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}