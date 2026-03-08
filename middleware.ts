import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { getClerkEnvStatus } from '@/lib/env/clerk';

const configuredClerkMiddleware = clerkMiddleware();

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (!getClerkEnvStatus().isConfigured) {
    return NextResponse.next();
  }

  return configuredClerkMiddleware(request, event);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};