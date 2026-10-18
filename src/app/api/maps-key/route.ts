// src/app/api/maps-key/route.ts
// Hands the Google Maps browser key to a signed-in user only.
//
// The key used to be NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, which Next.js copies into the
// JavaScript files under /_next/static — files the middleware deliberately leaves
// public, so anyone could read the key without signing in. Served from here, it never
// appears in any file; only Hyoje's browser receives it, at the moment the map loads.
// (A Maps JavaScript key can never be fully hidden from the browser that uses it —
// Google's website and API restrictions remain the real protection.)

import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  const userId = (session as any)?.user?.userId;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  return NextResponse.json(
    { key: process.env.GOOGLE_MAPS_BROWSER_KEY ?? '' },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
