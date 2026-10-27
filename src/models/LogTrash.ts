import { Schema, model, models } from 'mongoose';

// Deleted records (#70, Hyoje 27 Oct). A record deleted in the app moves here whole,
// with its own _id, so Undo can put it back and nothing else has to skip it: the
// log collection only ever holds live records.
//
//   record     the whole log document as it was, _id included
//   changeId   the change-list entry (master_change) of the delete
const LogTrashSchema = new Schema(
  {
    userId:    { type: String, required: true },
    record:    { type: Schema.Types.Mixed, required: true },
    deletedAt: { type: Date, required: true },
    changeId:  { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: false, collection: 'log_trash', minimize: false }
);

LogTrashSchema.index({ userId: 1, deletedAt: -1 });
LogTrashSchema.index({ userId: 1, 'record._id': 1 });

export default models.LogTrash || model('LogTrash', LogTrashSchema);
