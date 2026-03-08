import type { Route } from 'next';
import { getPublicRuntimeConfig } from '@/lib/env/public';

export function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

export function buildPlayHref(roomCode: string) {
  return `/play/${encodeURIComponent(normalizeRoomCode(roomCode))}` as Route;
}

export function buildRuntimeQuizImageSrc(input: {
  roomCode: string;
  objectKey: string;
  viewer: 'host' | 'player';
}) {
  const search = new URLSearchParams({
    roomCode: normalizeRoomCode(input.roomCode),
    objectKey: input.objectKey,
    viewer: input.viewer,
  });
  return `/runtime-assets?${search.toString()}`;
}

export function getClientRuntimeConfig() {
  const config = getPublicRuntimeConfig();

  return {
    environment: config.environment,
    spacetimeEndpoint: config.spacetimeEndpoint,
  };
}