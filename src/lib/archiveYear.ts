// The stored archive year (#73): the Archive file's archive tab is '~N'.
// Relative imports: the migration scripts use this too.

import AdminSettings from '../models/AdminSettings';
import { DEFAULT_ARCHIVE_UNTIL } from './yearTabs';

export async function getArchiveUntil(userId: string): Promise<number> {
  const doc = await AdminSettings.findOne({ userId }).select('archiveUntil').lean() as { archiveUntil?: number } | null;
  const n = Number(doc?.archiveUntil);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_ARCHIVE_UNTIL;
}

/** Only the rollover run calls this, after its records are in. */
export async function setArchiveUntil(userId: string, n: number): Promise<void> {
  await AdminSettings.updateOne({ userId }, { $set: { archiveUntil: n } }, { upsert: true });
}
