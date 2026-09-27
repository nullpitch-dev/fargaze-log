// src/app/api/calendar/settings/route.ts
//
// GET  /api/calendar/settings — the saved Calendar settings, or the defaults.
// PUT  /api/calendar/settings — body holds any subset of the four fields;
//      only those are replaced.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import CalendarSettings from '@/models/CalendarSettings';

interface CalendarSettingsDTO {
  hiddenCategories: string[];
  hiddenCrossActivities: string[];
  colors: Record<string, string>;
  showReading: boolean;
}

const DEFAULTS: CalendarSettingsDTO = {
  hiddenCategories: [], hiddenCrossActivities: [], colors: {}, showReading: true,
};

function toDTO(doc: any): CalendarSettingsDTO {
  return {
    hiddenCategories:      doc?.hiddenCategories ?? DEFAULTS.hiddenCategories,
    hiddenCrossActivities: doc?.hiddenCrossActivities ?? DEFAULTS.hiddenCrossActivities,
    colors:                doc?.colors ?? DEFAULTS.colors,
    showReading:           doc?.showReading ?? DEFAULTS.showReading,
  };
}

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 500 && v.every(s => typeof s === 'string' && s.length <= 100);

async function userIdOf() {
  const session = await auth();
  return (session as any)?.user?.userId as string | undefined;
}

export async function GET() {
  const userId = await userIdOf();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  await connectDB();
  const doc = await CalendarSettings.findOne({ userId }).lean();
  return NextResponse.json(toDTO(doc));
}

export async function PUT(req: NextRequest) {
  const userId = await userIdOf();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  const set: Partial<CalendarSettingsDTO> = {};
  if ('hiddenCategories' in body) {
    if (!isStrings(body.hiddenCategories)) return NextResponse.json({ error: 'hiddenCategories' }, { status: 400 });
    set.hiddenCategories = body.hiddenCategories;
  }
  if ('hiddenCrossActivities' in body) {
    if (!isStrings(body.hiddenCrossActivities)) return NextResponse.json({ error: 'hiddenCrossActivities' }, { status: 400 });
    set.hiddenCrossActivities = body.hiddenCrossActivities;
  }
  if ('colors' in body) {
    const c = body.colors;
    const ok = c && typeof c === 'object' && !Array.isArray(c)
      && Object.entries(c).length <= 500
      && Object.entries(c).every(([k, v]) => k.length <= 100 && typeof v === 'string' && v.length <= 20);
    if (!ok) return NextResponse.json({ error: 'colors' }, { status: 400 });
    set.colors = c;
  }
  if ('showReading' in body) {
    if (typeof body.showReading !== 'boolean') return NextResponse.json({ error: 'showReading' }, { status: 400 });
    set.showReading = body.showReading;
  }

  await connectDB();
  const doc = await CalendarSettings.findOneAndUpdate(
    { userId }, { $set: set, $setOnInsert: { userId } }, { upsert: true, new: true },
  ).lean();
  return NextResponse.json(toDTO(doc));
}
