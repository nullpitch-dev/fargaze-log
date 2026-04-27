import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';
import { shouldSkipRow } from '@/lib/migration/transform';
import { rowToDocument } from '@/lib/migration/rowToDocument';

export async function GET() {
  try {
    const rows = await getSheetData(
      process.env.SPREADSHEET_ID_ACTIVE!,
      'Active',
      3
    );

    const results = [];
    let skipped = 0;

    for (const row of rows.slice(0, 20)) {  // test first 20 rows only
      if (shouldSkipRow(row)) {
        skipped++;
        continue;
      }
      const doc = rowToDocument(row, 'hyoje');
      results.push(doc);
    }

    return NextResponse.json({
      status: 'ok',
      tested: 20,
      skipped,
      transformed: results.length,
      sample: results[0] ?? null,  // show first transformed document
    });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
