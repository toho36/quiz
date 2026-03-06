import { joinRoomAction } from '@/app/actions';
import { SectionCard } from '@/components/section-card';

export function JoinRoomForm({ roomCode }: { roomCode?: string }) {
  return (
    <SectionCard title="Join a room" eyebrow="Server action">
      <form action={joinRoomAction} className="space-y-4">
        <label className="block space-y-2 text-sm text-slate-300">
          <span>Room code</span>
          <input
            className="w-full rounded-2xl border border-border bg-slate-950 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
            defaultValue={roomCode}
            name="roomCode"
            placeholder="ABCD-1234"
          />
        </label>
        <label className="block space-y-2 text-sm text-slate-300">
          <span>Display name</span>
          <input
            className="w-full rounded-2xl border border-border bg-slate-950 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
            name="displayName"
            placeholder="Player One"
          />
        </label>
        <button className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">
          Join room
        </button>
      </form>
    </SectionCard>
  );
}