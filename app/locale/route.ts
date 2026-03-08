import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE_NAME, resolveLocale } from '@/lib/i18n/config';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = resolveLocale(url.searchParams.get('locale'));
  const nextPath = url.searchParams.get('next');
  const redirectPath = nextPath?.startsWith('/') ? nextPath : '/';

  (await cookies()).set(LOCALE_COOKIE_NAME, locale, {
    path: '/',
    sameSite: 'lax',
  });

  return NextResponse.redirect(new URL(redirectPath, url));
}