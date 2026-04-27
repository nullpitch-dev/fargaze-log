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
		docsToInsert.push(doc);
	 } catch (error: any) {
		result.errors++;
		result.errorDetails.push(`Row ${i + 3}: ${error.message}`);
	 }
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
