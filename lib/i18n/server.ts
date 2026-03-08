import { cookies } from 'next/headers';
import { LOCALE_COOKIE_NAME, resolveLocale, type Locale } from '@/lib/i18n/config';
import type { LocaleDictionary } from '@/lib/i18n/dictionary';

const dictionaryLoaders: Record<Locale, () => Promise<{ default: LocaleDictionary }>> = {
  cs: () => import('@/lib/i18n/dictionaries/cs'),
  en: () => import('@/lib/i18n/dictionaries/en'),
};

export async function getRequestLocale() {
  return resolveLocale((await cookies()).get(LOCALE_COOKIE_NAME)?.value);
}

export async function getDictionary(locale: Locale) {
  return (await dictionaryLoaders[locale]()).default;
}

export async function getLocaleContext() {
  const locale = await getRequestLocale();

  return {
    locale,
    dictionary: await getDictionary(locale),
  };
}