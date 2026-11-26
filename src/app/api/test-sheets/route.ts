import { requireUser } from '@/lib/admin/guard';
import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';

export async function GET() {
  // Its own sign-in check (26 Nov): the middleware no longer runs for /api (Vercel CPU).
  const g = await requireUser();
  if (g.denied) return g.denied;
  try {
    const data = await getSheetData(
      process.env.SPREADSHEET_ID_ACTIVE!,
      'Active',
      3
    );
    return NextResponse.json({
      status: 'ok',
      rowCount: data.length,
      firstRow: data[0] ?? null
    });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
