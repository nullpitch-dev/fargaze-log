import { Schema, model, models } from 'mongoose';

// One document per change made on the admin pages (#67).
//
// Before the freeze the sheet held the truth for records, so every change made here had to
// be repeated in the sheet by hand (`sheetDone` was that tick, and an unticked change blocked
// the migrations). The sheet was frozen at midnight 13/14 Nov 2026 (#74): since then every
// change is saved as done, with no steps (the hook below), and nothing waits for the sheet.
// The fields stay so older entries keep their history.
//
//   kind     add | edit | delete | rename | merge
//   list     the admin list slug (src/lib/admin/lists.ts)
//   before / after   the row's values before and after (null for add / delete)
//   recordIds        records changed by a rename / merge, kept for Undo
//   sheetSteps       what to repeat in the sheet, in plain words
//   undoneAt         set when the change was undone (the undo is its own entry)
//   extra            rename / merge: { title, plan, counts } — what Undo needs (#67 step 3)
//
// Record changes (#70) use the same list, so an unticked one blocks the migrations too:
//   list 'records', kind 'edit' | 'delete' (an undone delete is logged as 'add'),
//   or 'replace' — a bulk Find & replace (src/lib/records/replace.ts): before holds the
//   request, extra { title, steps (Find & Replace), lines (per record, when filtered),
//   items: [{ id, path, before, after, … }] for Undo, afterUpdatedAt };
//   rowId the record's _id, before / after the whole record, recordIds [its _id],
//   extra { title, tab, findRow, moveTo, lines: [{ column, what, before, after,
//   calculated? }], afterUpdatedAt } — one line per changed cell (src/lib/records)
const MasterChangeSchema = new Schema(
  {
    userId:         { type: String, required: true },
    list:           { type: String, required: true },
    kind:           { type: String, required: true, enum: ['add', 'edit', 'delete', 'rename', 'merge', 'replace'] },
    rowId:          { type: String, default: null },
    before:         { type: Schema.Types.Mixed, default: null },
    after:          { type: Schema.Types.Mixed, default: null },
    recordsChanged: { type: Number, default: 0 },
    recordIds:      { type: [Schema.Types.ObjectId], default: [] },
    sheetSteps:     { type: [String], default: [] },
    sheetDone:      { type: Boolean, default: false },
    sheetDoneAt:    { type: Date, default: null },
    undoneAt:       { type: Date, default: null },
		undoOf:         { type: Schema.Types.ObjectId, default: null },
    extra:          { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true, collection: 'master_change' }
);

// The sheet is frozen: nothing is ever left to repeat there (14 Nov 2026).
function frozen(doc: any) {
  doc.sheetDone = true;
  doc.sheetDoneAt = doc.sheetDoneAt ?? new Date();
  doc.sheetSteps = [];
}
MasterChangeSchema.pre('validate', function () { frozen(this); });

MasterChangeSchema.index({ userId: 1, list: 1, createdAt: -1 });
MasterChangeSchema.index({ userId: 1, sheetDone: 1 });

export default models.MasterChange || model('MasterChange', MasterChangeSchema);
