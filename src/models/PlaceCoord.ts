import mongoose, { Schema, model, models } from 'mongoose';

// One document per place name used in From / To: where it is.
// Source: Active file > PlaceCoord sheet. Loaded by `npm run migrate-place-coord`.
//
// `name` is the name as logged, after 집 / 회사 / 사이트 / 내차 are resolved through
// favorite_place (so a home appears under its real name, e.g. 라클라스 집).
// Rows whose Coords cell is blank are not loaded: they are names that have been
// looked at and have no point yet.
const PlaceCoordSchema = new Schema(
  {
    userId: { type: String, required: true },
    name:   { type: String, required: true },
    lat:    { type: Number, required: true },
    lng:    { type: Number, required: true },
    source: { type: String, default: 'manual' },   // manual / osm
    note:   { type: String, default: '' },
  },
  { timestamps: true, collection: 'place_coord' }
);

PlaceCoordSchema.index({ userId: 1, name: 1 }, { unique: true });

export default models.PlaceCoord || model('PlaceCoord', PlaceCoordSchema);
