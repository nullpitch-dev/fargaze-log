import mongoose, { Schema, model, models } from 'mongoose';

// One document per label period: which real place a generic label
// (집 / 회사 / 사이트 / 내차) meant between two moments.
// Source: Active file > FavoritePlace sheet. Loaded by `npm run migrate-favorite-place`.
//
// Each boundary keeps the sheet's own values (timezone code + local date/time)
// and the true UTC instant computed from timezone_master. Compare log records
// against fromAt / toAt only — local clock times from different zones are not
// comparable. A null boundary is open: no from = since the beginning,
// no to = still current. Both ends are inclusive.
const BoundarySchema = new Schema(
  {
    timezone: { type: String, required: true },   // e.g. KST, GMT
    local:    { type: String, required: true },   // 'YYYY-MM-DD HH:mm' as written in the sheet
    at:       { type: Date,   required: true },   // true UTC instant
  },
  { _id: false }
);

const FavoritePlaceSchema = new Schema(
  {
    userId: { type: String, required: true },
    label:  { type: String, required: true },
    name:   { type: String, required: true },
    from:   { type: BoundarySchema, default: null },
    to:     { type: BoundarySchema, default: null },
  },
  { timestamps: true, collection: 'favorite_place' }
);

FavoritePlaceSchema.index({ userId: 1, label: 1, 'from.at': 1 });

export default models.FavoritePlace || model('FavoritePlace', FavoritePlaceSchema);
