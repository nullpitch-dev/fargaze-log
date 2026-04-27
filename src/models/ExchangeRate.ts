import mongoose, { Schema, Document } from 'mongoose';

export interface IExchangeRate extends Document {
  userId: string;
  currency: string;
  rateKRW: number;
  updatedAt: Date;
}

const ExchangeRateSchema = new Schema<IExchangeRate>({
  userId: { type: String, required: true, index: true },
  currency: { type: String, required: true },
  rateKRW: { type: Number, required: true },
}, {
  timestamps: true,
  collection: 'exchange_rate',
});

ExchangeRateSchema.index({ userId: 1, currency: 1 }, { unique: true });

export default mongoose.models.ExchangeRate || mongoose.model<IExchangeRate>('ExchangeRate', ExchangeRateSchema);
