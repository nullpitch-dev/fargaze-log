import mongoose, { Schema, Document } from 'mongoose';

export interface ICostMaster extends Document {
  userId: string;
  categoryDetail: string;
  category: string;
}

const CostMasterSchema = new Schema<ICostMaster>({
  userId: { type: String, required: true, index: true },
  categoryDetail: { type: String, required: true },
  category: { type: String, required: true },
}, {
  timestamps: true,
  collection: 'cost_master',
});

CostMasterSchema.index({ userId: 1, categoryDetail: 1 }, { unique: true });

export default mongoose.models.CostMaster || mongoose.model<ICostMaster>('CostMaster', CostMasterSchema);
