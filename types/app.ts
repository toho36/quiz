export type AppEnvironment = 'local' | 'preview' | 'production';

export type AppRoute = {
  href: '/' | '/dashboard' | '/authoring' | '/host' | '/join';
  label: string;
  description: string;
  section: 'public' | 'workspace' | 'runtime';
};