/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { THEME_STORAGE_KEY, getThemeScript, resolveTheme } from '@/lib/theme';

describe('theme system', () => {
  test('resolveTheme prefers a stored explicit theme value', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  test('resolveTheme falls back to the system preference for invalid or missing values', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme('unexpected', false)).toBe('light');
  });

  test('theme bootstrap script applies the shared storage and html class contract', () => {
    const script = getThemeScript();

    expect(script).toContain(THEME_STORAGE_KEY);
    expect(script).toContain("root.dataset.theme");
    expect(script).toContain("root.classList.toggle('dark'");
    expect(script).toContain('prefers-color-scheme: dark');
  });
});