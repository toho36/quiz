import { joinRoomAction } from '@/app/actions';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function JoinRoomForm({ roomCode }: { roomCode?: string }) {
  return (
    <SectionCard title="Join a room" eyebrow="Server action">
      <form action={joinRoomAction} className="space-y-4">
        <Label className="flex-col items-start gap-2 text-sm text-muted-foreground" htmlFor="room-code">
          <span>Room code</span>
          <Input
            id="room-code"
            className="h-11 rounded-2xl bg-background/60 px-4"
            defaultValue={roomCode}
            name="roomCode"
            placeholder="ABCD-1234"
          />
        </Label>
        <Label className="flex-col items-start gap-2 text-sm text-muted-foreground" htmlFor="display-name">
          <span>Display name</span>
          <Input
            id="display-name"
            className="h-11 rounded-2xl bg-background/60 px-4"
            name="displayName"
            placeholder="Player One"
          />
        </Label>
        <Button className="h-10 rounded-full px-4" type="submit">
          Join room
        </Button>
      </form>
    </SectionCard>
  );
}