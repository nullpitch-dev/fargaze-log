# FarGaze Documentation Generators

This folder generates the two living documents as Word files from code, so updates
are cheap targeted patches instead of full rewrites.

## Files

| File | Produces |
|------|----------|
| `docx-helpers.js` | Shared helpers (headings, tables, bullets, page setup). Required by both generators. |
| `gen-design.js`   | `FarGaze-Log-Data-Design-v3.3.docx` — the full Design & Requirements doc. |
| `gen-wbs.js`      | `FarGaze-WBS-v2.5.docx` — the full Service Concept & WBS. |

Each generator is the **single source of truth** for its document. All sections —
including unchanged ones — live inside the `C(...)` calls in the script.

## How to build the documents

```bash
npm install docx          # one time
node gen-design.js        # writes FarGaze-Log-Data-Design-v3.3.docx
node gen-wbs.js           # writes FarGaze-WBS-v2.5.docx
```

Optional validation (if the docx skill is available):
```bash
python3 /mnt/skills/public/docx/scripts/office/validate.py FarGaze-Log-Data-Design-v3.3.docx
```

Then upload the .docx files to Google Drive manually (Drive's API would save them as
Google-native format and lose docx formatting, so manual upload is the established path).

## How to update a document (the cheap workflow)

1. Decide the change (e.g. "exercise widget #58 is now complete").
2. Either edit the relevant `C(...)` line(s) yourself, OR tell Claude the delta and
   Claude returns a small `str_replace` patch to the generator — the same no-full-
   replacement rule used for shared code files.
3. Bump the version: update the title line, add a row to the Version History table,
   update the footer and the `writeFileSync` filename.
4. Re-run `node gen-*.js`.

Because Claude never has to re-read or re-emit the whole document, updates are fast
and cheap — only the changed lines move through the conversation.

## Versioning convention

- Design Doc: `vMAJOR.MINOR` — bump MINOR for feature additions (e.g. v3.2 → v3.3).
- WBS: `vMAJOR.MINOR` — same.
- Always add a Version History row describing the change; never delete old rows.
- Every section stays fully written out — no "unchanged from previous version".

## Current versions

- Design Doc: **v3.3** (12 Jun 2026) — adds Diet widget (WBS #61) Summary view: diet.summary API, seven summary metrics, Treemap / CalendarHeatmap / CssDailyChart components, categoryColors palette (§13.8). Trend view pending.
- WBS: **v2.5** (12 Jun 2026) — WBS #61 (Diet widget) Summary view complete; Trend view pending.
