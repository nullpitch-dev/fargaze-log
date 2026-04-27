import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';
import { migrateSheet } from '@/lib/migration/migrate';

export async function GET() {
  try {
    const result = await migrateSheet(
      process.env.SPREADSHEET_ID_ACTIVE!,
      'Active',
      'hyoje'
    );

    // Check count immediately after migration
    await connectDB();
    const count = await Log.countDocuments({ userId: 'hyoje' });

    return NextResponse.json({ status: 'ok', result, countAfterMigration: count });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
