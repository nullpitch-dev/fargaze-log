import { Schema, model, models } from 'mongoose';

// One document per value of a reference list (#67, 24 Oct 2026).
// Until then each list was one document holding an array of values; the change was
// made by `scripts/prepare-master-admin.ts --apply`. Edited on the admin pages;
// no longer loaded from the sheet.
//   listName  e.g. transport.method (names: src/lib/admin/lists.ts)
//   order     position in the list, as the sheet showed it
const ReferenceListSchema = new Schema(
  {
    userId:   { type: String, required: true },
    listName: { type: String, required: true },
    value:    { type: String, required: true },
    order:    { type: Number, required: true },
  },
  { timestamps: true, collection: 'reference_lists' }
);

ReferenceListSchema.index({ userId: 1, listName: 1, value: 1 }, { unique: true });

export default models.ReferenceList || model('ReferenceList', ReferenceListSchema);
