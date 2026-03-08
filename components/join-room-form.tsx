import { joinRoomAction } from '@/app/actions';
import { SectionCard } from '@/components/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LocaleDictionary } from '@/lib/i18n/dictionary';

export function JoinRoomForm({
  roomCode,
  copy,
}: {
  roomCode?: string;
  copy: LocaleDictionary['joinForm'];
}) {
  return (
    <SectionCard title={copy.title} eyebrow={copy.eyebrow}>
      <form action={joinRoomAction} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Label className="flex-col items-start gap-2 text-sm text-muted-foreground" htmlFor="room-code">
            <span>{copy.roomCodeLabel}</span>
            <Input
              id="room-code"
              className="h-11 rounded-2xl border-border/70 bg-background/60 px-4"
              defaultValue={roomCode}
              name="roomCode"
              placeholder={copy.roomCodePlaceholder}
            />
          </Label>
          <Label className="flex-col items-start gap-2 text-sm text-muted-foreground" htmlFor="display-name">
            <span>{copy.displayNameLabel}</span>
            <Input
              id="display-name"
              className="h-11 rounded-2xl border-border/70 bg-background/60 px-4"
              name="displayName"
              placeholder={copy.displayNamePlaceholder}
            />
          </Label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button className="h-11 rounded-full px-5" type="submit">
            {copy.submitLabel}
          </Button>
          {roomCode ? (
            <Badge variant="secondary" className="rounded-full bg-secondary/15 px-3 py-1 text-secondary-foreground">
              {copy.roomCodeLabel} · {roomCode}
            </Badge>
          ) : null}
        </div>
      </form>
    </SectionCard>
  );
}