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
    description: 'Future Clerk-protected overview for author-owned quizzes.',
    section: 'workspace',
  },
  {
    href: '/authoring',
    label: 'Authoring',
    description: 'Future authoring workspace backed by server actions and validators.',
    section: 'workspace',
  },
  {
    href: '/host',
    label: 'Host',
    description: 'Server-rendered room bootstrap boundary for host claims.',
    section: 'runtime',
  },
  {
    href: '/join',
    label: 'Join',
    description: 'Guest join entry point that keeps player state room-scoped.',
    section: 'runtime',
  },
];

export const primaryRoutes = appRoutes.filter((route) => route.href !== '/');
export const workspaceRoutes = appRoutes.filter((route) => route.section === 'workspace');
export const runtimeRoutes = appRoutes.filter((route) => route.section === 'runtime');