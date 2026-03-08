import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n/config';
import type { LocaleDictionary } from '@/lib/i18n/dictionary';

function buildLocaleHref(locale: Locale, nextPath: string) {
  const search = new URLSearchParams({ locale, next: nextPath });
  return `/locale?${search.toString()}`;
}

export function LocaleSwitcher({
  locale,
  nextPath,
  dictionary,
}: {
  locale: Locale;
  nextPath: string;
  dictionary: Pick<LocaleDictionary, 'localeLabel' | 'localeNames'>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>{dictionary.localeLabel}:</span>
      {(['cs', 'en'] as const).map((candidate) => (
        <Link
          key={candidate}
          className={cn(
            'rounded-full border px-3 py-1 transition-colors',
            candidate === locale ? 'border-sky-400/40 bg-sky-400/10 text-sky-100' : 'border-border hover:text-foreground',
          )}
          href={buildLocaleHref(candidate, nextPath)}
        >
          {dictionary.localeNames[candidate]}
        </Link>
      ))}
    </div>
  );
}