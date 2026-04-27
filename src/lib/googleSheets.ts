import { google } from 'googleapis';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

export async function getSheetClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'myfiles', process.env.GOOGLE_SERVICE_ACCOUNT_FILE!),
    scopes: SCOPES,
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client as any });
  return sheets;
}

export async function getSheetData(
  spreadsheetId: string,
  sheetName: string,
  startRow: number = 3  // skip first two header rows
): Promise<any[][]> {
  const sheets = await getSheetClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A${startRow}:CG`,  // CG = column 85
  });
  return response.data.values || [];
}
