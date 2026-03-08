export const SUPPORTED_LOCALES = ['cs', 'en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'cs';
export const LOCALE_COOKIE_NAME = 'quiz-locale';

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'cs' || value === 'en';
}

export function resolveLocale(value?: string | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}