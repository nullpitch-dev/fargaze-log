import mongoose, { Schema, Document } from 'mongoose';

export interface IReferenceList extends Document {
  userId: string;
  listName: string;
  values: string[];
}

const ReferenceListSchema = new Schema<IReferenceList>({
  userId: { type: String, required: true, index: true },
  listName: { type: String, required: true },
  values: [{ type: String }],
}, {
  timestamps: true,
  collection: 'reference_lists',
});

ReferenceListSchema.index({ userId: 1, listName: 1 }, { unique: true });

export default mongoose.models.ReferenceList || mongoose.model<IReferenceList>('ReferenceList', ReferenceListSchema);
