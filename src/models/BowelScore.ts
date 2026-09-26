import mongoose, { Schema, model, models } from 'mongoose';

// One document per allowed bowel value, with its score.
// Source: Active file > Bowel sheet. Loaded by `npm run migrate-bowel`.
//   field: 'amount' | 'quality' | 'characteristics'
const BowelScoreSchema = new Schema(
  {
    userId: { type: String, required: true },
    field:  { type: String, required: true, enum: ['amount', 'quality', 'characteristics'] },
    value:  { type: String, required: true },
    score:  { type: Number, required: true },
  },
  { timestamps: true, collection: 'bowel_score' }
);

BowelScoreSchema.index({ userId: 1, field: 1, value: 1 }, { unique: true });

export default models.BowelScore || model('BowelScore', BowelScoreSchema);
