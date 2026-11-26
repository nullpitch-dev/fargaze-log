// Google Calendar sync (Design §15.9, Hyoje 26 Nov 2026): the calendars a record can go to.
// Pure: the form uses it too. Family only for now; more can be added here later — a record
// stores the key (sync.calendar), so adding one needs no data change.
//
// The ID of each calendar is an env setting on the server (GCAL_<KEY>_ID), never in the code.

export interface CalendarChoice { key: string; label: string }

export const CALENDARS: CalendarChoice[] = [
  { key: 'family', label: 'Family' },
];

export const DEFAULT_CALENDAR = 'family';

export const calendarLabel = (key: string | null | undefined) =>
  CALENDARS.find(c => c.key === key)?.label ?? key ?? '';
