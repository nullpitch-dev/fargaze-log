import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';
import { migrateSheet } from '@/lib/migration/migrate';

export async function GET() {
  try {
    const results = [];

    // Archive sheets first (largest datasets)
    results.push(await migrateSheet(
      process.env.SPREADSHEET_ID_ARCHIVE!,
      '~2025',
      'hyoje'
    ));

    results.push(await migrateSheet(
      process.env.SPREADSHEET_ID_ARCHIVE!,
      '2026',
      'hyoje'
    ));

    // Active sheets
    results.push(await migrateSheet(
      process.env.SPREADSHEET_ID_ACTIVE!,
      'History',
      'hyoje'
    ));

    results.push(await migrateSheet(
      process.env.SPREADSHEET_ID_ACTIVE!,
      'Future',
      'hyoje'
    ));

    results.push(await migrateSheet(
      process.env.SPREADSHEET_ID_ACTIVE!,
      'Active',
      'hyoje'
    ));

    await connectDB();
    const totalInDB = await Log.countDocuments({ userId: 'hyoje' });

    return NextResponse.json({ status: 'ok', results, totalInDB });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
