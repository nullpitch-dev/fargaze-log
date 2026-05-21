import mongoose, { Schema, Document } from 'mongoose';

export interface IAlcoholConversion extends Document {
  userId: string;
  item: string;
  unit: string;
  unitTo50ml: number;
  alcoholRatio: number;
  drinks: number;
}

const AlcoholConversionSchema = new Schema<IAlcoholConversion>({
  userId:       { type: String, required: true, index: true },
  item:         { type: String, required: true },
  unit:         { type: String, required: true },
  unitTo50ml:   { type: Number, required: true },
  alcoholRatio: { type: Number, required: true },
  drinks:       { type: Number, required: true },
}, {
  timestamps: true,
  collection: 'alcohol_conversion',
});

AlcoholConversionSchema.index({ userId: 1, item: 1, unit: 1 }, { unique: true });

export default mongoose.models.AlcoholConversion
  || mongoose.model<IAlcoholConversion>('AlcoholConversion', AlcoholConversionSchema);
