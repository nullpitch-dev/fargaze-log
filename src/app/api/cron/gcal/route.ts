// GET /api/cron/gcal — the nightly Google Calendar check (Design §15.9), run by Vercel Cron
// (vercel.json, 03:17 UTC). Looks again at everything changed in the last 3 days and at
// every event the app made, so a run that failed or was cut short is put right, and an
// event whose record is gone for good is removed.
//
// Vercel sends "Authorization: Bearer <CRON_SECRET>" (the CRON_SECRET env setting); anything
// else is refused. Not behind the sign-in (middleware.ts leaves /api/cron alone).

import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import GcalState from '@/models/GcalState';
import { syncCalendar } from '@/lib/gcal/sync';
import { syncConfigured } from '@/lib/gcal/google';

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!syncConfigured()) return NextResponse.json({ ok: true, skipped: 'not set up' });
  await connectDB();
  // The users who have used the sync (a row in gcal_state is made on the first run).
  const users: string[] = await GcalState.distinct('userId');
  const since = new Date(Date.now() - 3 * 86_400_000);
  const out: Record<string, unknown> = {};
  for (const u of users) out[u] = await syncCalendar(u, { since, all: true });
  console.log('[gcal] nightly', JSON.stringify(out));
  return NextResponse.json({ ok: true, users: out });
}
