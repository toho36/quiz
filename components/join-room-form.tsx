import { joinRoomAction } from '@/app/actions';
import { SectionCard } from '@/components/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function JoinRoomForm({ roomCode }: { roomCode?: string }) {
  return (
    <SectionCard
      title="Join a room"
      eyebrow="Player identity"
      description="Enter the host-provided room code and pick the name that should appear on the shared leaderboard."
      action={<Badge variant="outline" className="rounded-full border-border/70 bg-background/75 px-3 py-1 text-[0.65rem] uppercase tracking-[0.24em]">Guest-friendly</Badge>}
    >
      <form action={joinRoomAction} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Label className="flex-col items-start gap-2 text-sm text-muted-foreground" htmlFor="room-code">
            <span>Room code</span>
            <Input
              id="room-code"
              className="h-11 rounded-2xl border-border/70 bg-background/60 px-4"
              defaultValue={roomCode}
              name="roomCode"
              placeholder="ABCD-1234"
            />
          </Label>
          <Label className="flex-col items-start gap-2 text-sm text-muted-foreground" htmlFor="display-name">
            <span>Display name</span>
            <Input
              id="display-name"
              className="h-11 rounded-2xl border-border/70 bg-background/60 px-4"
              name="displayName"
              placeholder="Player One"
            />
          </Label>
        </div>
        <div className="rounded-[1.5rem] border border-border/70 bg-background/50 px-4 py-4">
          <p className="text-sm font-medium text-foreground">Quick tip</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Room codes are shared by the host. Your display name stays scoped to this room session and powers the live leaderboard view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button className="h-11 rounded-full px-5" type="submit">
            Join room
          </Button>
          {roomCode ? (
            <Badge variant="secondary" className="rounded-full bg-secondary/15 px-3 py-1 text-secondary-foreground">
              Code · {roomCode}
            </Badge>
          ) : null}
        </div>
      </form>
    </SectionCard>
  );
}