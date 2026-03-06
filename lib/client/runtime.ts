import type { Route } from 'next';
import { getPublicRuntimeConfig } from '@/lib/env/public';

export function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

export function buildPlayHref(roomCode: string) {
  return `/play/${encodeURIComponent(normalizeRoomCode(roomCode))}` as Route;
}

export function getClientRuntimeConfig() {
  const config = getPublicRuntimeConfig();

  return {
    environment: config.environment,
    spacetimeEndpoint: config.spacetimeEndpoint,
  };
}