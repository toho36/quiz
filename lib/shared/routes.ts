import type { AppRoute } from '@/types/app';

export const appRoutes: AppRoute[] = [
  {
    href: '/',
    label: 'Landing',
    description: 'Public-facing shell that points users into authoring or room flows.',
    section: 'public',
  },
  {
    href: '/dashboard',
    label: 'Dashboard',
    description: 'Guarded demo author dashboard with publish and host-room actions.',
    section: 'workspace',
  },
  {
    href: '/authoring',
    label: 'Authoring',
    description: 'Minimal authoring form backed by the shared server-side quiz boundary.',
    section: 'workspace',
  },
  {
    href: '/host',
    label: 'Host',
    description: 'Host room view that advances lifecycle through the runtime gameplay service.',
    section: 'runtime',
  },
  {
    href: '/join',
    label: 'Join',
    description: 'Player join form that binds a room-scoped session before play.',
    section: 'runtime',
  },
];

export const primaryRoutes = appRoutes.filter((route) => route.href !== '/');
export const workspaceRoutes = appRoutes.filter((route) => route.section === 'workspace');
export const runtimeRoutes = appRoutes.filter((route) => route.section === 'runtime');