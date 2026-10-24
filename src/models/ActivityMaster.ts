import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityMaster extends Document {
  userId: string;
  name: string;
  category: string;
}

const ActivityMasterSchema = new Schema<IActivityMaster>({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
}, {
  timestamps: true,
  collection: 'activity_master',
});

// An activity name is unique across all categories (Hyoje, 24 Oct 2026), so moving
// an activity to another category is a change to its category, not a new row.
ActivityMasterSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.models.ActivityMaster || mongoose.model<IActivityMaster>('ActivityMaster', ActivityMasterSchema);
