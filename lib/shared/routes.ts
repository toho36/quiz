import type { LocaleDictionary, RouteCopyKey, RouteSection } from '@/lib/i18n/dictionary';
import type { AppRoute } from '@/types/app';

const routeDefinitions = [
  { key: 'landing', href: '/', section: 'public' },
  { key: 'dashboard', href: '/dashboard', section: 'workspace' },
  { key: 'authoring', href: '/authoring', section: 'workspace' },
  { key: 'host', href: '/host', section: 'runtime' },
  { key: 'join', href: '/join', section: 'runtime' },
] as const satisfies ReadonlyArray<{ key: RouteCopyKey; href: AppRoute['href']; section: RouteSection }>;

function buildRoute(copy: LocaleDictionary['routes'], definition: (typeof routeDefinitions)[number]): AppRoute {
  const routeCopy = copy.items[definition.key];

  return {
    href: definition.href,
    label: routeCopy.label,
    description: routeCopy.description,
    section: definition.section,
  };
}

export function getAppRoutes(copy: LocaleDictionary['routes']) {
  return routeDefinitions.map((definition) => buildRoute(copy, definition));
}

export function getPrimaryRoutes(copy: LocaleDictionary['routes']) {
  return getAppRoutes(copy).filter((route) => route.href !== '/');
}

export function getWorkspaceRoutes(copy: LocaleDictionary['routes']) {
  return getAppRoutes(copy).filter((route) => route.section === 'workspace');
}

export function getRuntimeRoutes(copy: LocaleDictionary['routes']) {
  return getAppRoutes(copy).filter((route) => route.section === 'runtime');
}

export function getRouteSectionLabel(copy: LocaleDictionary['routes'], section: RouteSection) {
  return copy.sections[section];
}