import { Schema, model, models } from 'mongoose';

// One document per change made on the admin pages (#67).
//
// Before cutover the sheet holds the truth for records, so every change made here
// must be repeated in the sheet by hand. `sheetDone` is that tick; while any change
// is unticked, the migration refuses to run.
//
//   kind     add | edit | delete | rename | merge
//   list     the admin list slug (src/lib/admin/lists.ts)
//   before / after   the row's values before and after (null for add / delete)
//   recordIds        records changed by a rename / merge, kept for Undo
//   sheetSteps       what to repeat in the sheet, in plain words
//   undoneAt         set when the change was undone (the undo is its own entry)
const MasterChangeSchema = new Schema(
  {
    userId:         { type: String, required: true },
    list:           { type: String, required: true },
    kind:           { type: String, required: true, enum: ['add', 'edit', 'delete', 'rename', 'merge'] },
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
  },
  { timestamps: true, collection: 'master_change' }
);

MasterChangeSchema.index({ userId: 1, list: 1, createdAt: -1 });
MasterChangeSchema.index({ userId: 1, sheetDone: 1 });

export default models.MasterChange || model('MasterChange', MasterChangeSchema);
