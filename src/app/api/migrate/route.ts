import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { migrateSheet } from '@/lib/migration/migrate';

export async function POST(request: NextRequest) {
  // Only allow authenticated requests
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { spreadsheetId, sheetName, userId } = await request.json();

    if (!spreadsheetId || !sheetName || !userId) {
      return NextResponse.json(
        { error: 'spreadsheetId, sheetName and userId are required' },
        { status: 400 }
      );
    }

    const result = await migrateSheet(spreadsheetId, sheetName, userId);

    return NextResponse.json({ status: 'ok', result });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
