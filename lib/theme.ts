export type AppTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'quiz-ui-theme';

export function parseTheme(value: string | null | undefined): AppTheme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

export function resolveTheme(value: string | null | undefined, systemPrefersDark: boolean): AppTheme {
  return parseTheme(value) ?? (systemPrefersDark ? 'dark' : 'light');
}

export function getThemeScript() {
  return `(() => {
    const key = '${THEME_STORAGE_KEY}';
    const root = document.documentElement;
    const applyTheme = (theme) => {
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
      root.classList.toggle('dark', theme === 'dark');
    };
    let storedTheme = null;
    try {
      storedTheme = window.localStorage.getItem(key);
    } catch {}
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : prefersDark ? 'dark' : 'light');
  })();`;
}