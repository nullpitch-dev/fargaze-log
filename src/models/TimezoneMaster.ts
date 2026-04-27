import mongoose, { Schema, Document } from 'mongoose';

export interface ITimezoneMaster extends Document {
  userId: string;
  code: string;
  offsetUTC: number;
  ianaTimezone: string;
  city: string;
}

const TimezoneMasterSchema = new Schema<ITimezoneMaster>({
  userId: { type: String, required: true, index: true },
  code: { type: String, required: true },
  offsetUTC: { type: Number, required: true },
  ianaTimezone: { type: String, required: true },
  city: { type: String, required: true },
}, {
  timestamps: true,
  collection: 'timezone_master',
});

TimezoneMasterSchema.index({ userId: 1, code: 1 }, { unique: true });

export default mongoose.models.TimezoneMaster || mongoose.model<ITimezoneMaster>('TimezoneMaster', TimezoneMasterSchema);
