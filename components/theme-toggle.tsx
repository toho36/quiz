'use client';

import { MoonStar, SunMedium } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { THEME_STORAGE_KEY, type AppTheme, resolveTheme } from '@/lib/theme';

function readTheme(): AppTheme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return resolveTheme(
    document.documentElement.dataset.theme,
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
}

function applyTheme(theme: AppTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.classList.toggle('dark', theme === 'dark');

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<AppTheme | null>(null);

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const activeTheme = theme ?? 'light';
  const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
  const label = useMemo(() => (activeTheme === 'dark' ? 'Dark mode' : 'Light mode'), [activeTheme]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`Switch to ${nextTheme} theme`}
      className="rounded-full border-border/70 bg-background/75 px-3 text-foreground shadow-sm shadow-primary/10 backdrop-blur-xl"
      onClick={() => {
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
    >
      {activeTheme === 'dark' ? <MoonStar className="size-4 text-primary" /> : <SunMedium className="size-4 text-primary" />}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}