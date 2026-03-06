'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buildPlayHref, normalizeRoomCode } from '@/lib/client/runtime';
import { SectionCard } from '@/components/section-card';

export function JoinRoomForm() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');

  const normalizedRoomCode = normalizeRoomCode(roomCode);

  return (
    <SectionCard title="Join a room" eyebrow="Client component">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!normalizedRoomCode) {
            return;
          }
          router.push(buildPlayHref(normalizedRoomCode));
        }}
      >
        <label className="block space-y-2 text-sm text-slate-300">
          <span>Room code</span>
          <input
            className="w-full rounded-2xl border border-border bg-slate-950 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
            onChange={(event) => setRoomCode(event.target.value)}
            placeholder="ABCD-1234"
            value={roomCode}
          />
        </label>
        <label className="block space-y-2 text-sm text-slate-300">
          <span>Display name</span>
          <input
            className="w-full rounded-2xl border border-border bg-slate-950 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="Player One"
            value={playerName}
          />
        </label>
        <button
          className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
          disabled={!normalizedRoomCode || !playerName.trim()}
          type="submit"
        >
          Enter play shell
        </button>
      </form>
    </SectionCard>
  );
}