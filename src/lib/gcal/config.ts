// Google Calendar sync (§15.9): its settings, apart from the Google library (google.ts), so
// the routes that start a sync don't load googleapis on every cold start — it is imported
// only when there is something to send (26 Nov, Vercel CPU).

export const calendarIdOf = (key: string): string | null => process.env[`GCAL_${key.toUpperCase()}_ID`]?.trim() || null;

/** Whether the sync can run at all here: a key and at least one calendar ID. */
export const syncConfigured = () => !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim()) && !!calendarIdOf('family');
