import connectDB from '@/lib/mongodb';
import { getSheetData } from '@/lib/googleSheets';
import { createRowFilter } from '@/lib/migration/transform';
import { rowToDocument } from '@/lib/migration/rowToDocument';
import Log from '@/models/Log';

interface MigrationResult {
  sheet: string;
  total: number;
  skipped: number;
  inserted: number;
  duplicates: number;
  errors: number;
  errorDetails: string[];
}

export async function migrateSheet(
  spreadsheetId: string,
  sheetName: string,
  userId: string
): Promise<MigrationResult> {
  const result: MigrationResult = {
    sheet: sheetName,
    total: 0,
    skipped: 0,
    inserted: 0,
    duplicates: 0,
    errors: 0,
    errorDetails: [],
  };

  await connectDB();

  const rows = await getSheetData(spreadsheetId, sheetName, 3);
  result.total = rows.length;
  const docsToInsert = [];
  const shouldSkipRow = createRowFilter();

  for (let i = 0; i < rows.length; i++) {
	 const row = rows[i];

	 if (shouldSkipRow(row)) {
		result.skipped++;
		continue;
	 }

  try {
    const doc = rowToDocument(row, userId);

    // Check for #N/A in cost.category for past entries
    const rawCostCategory = row[33]?.toString().trim();
    const endDatetime = doc.end?.datetime;
    const now = new Date();

    if (rawCostCategory === '#N/A' && endDatetime && endDatetime < now) {
      result.errors++;
      result.errorDetails.push(
        `Row ${i + startRow}: Past entry with #N/A cost category — "${doc.activity?.title}" on ${doc.start?.year}-${doc.start?.month}-${doc.start?.day}`
      );
      continue;
    }

    docsToInsert.push(doc);
  } catch (error: any) {
    result.errors++;
    result.errorDetails.push(`Row ${i + startRow}: ${error.message}`);
  }

  if (docsToInsert.length > 0) {
    try {
      const insertResult = await Log.insertMany(docsToInsert, { ordered: false });
      result.inserted = insertResult.length;
    } catch (error: any) {
      result.errors++;
      result.errorDetails.push(`Bulk insert error: ${error.message}`);
    }
  }

  return result;
}
