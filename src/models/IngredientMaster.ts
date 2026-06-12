import mongoose, { Schema, model, models } from 'mongoose';

const IngredientMasterSchema = new Schema(
  {
    userId: { type: String, required: true },
    level1: { type: String, required: true },
    level2: { type: String, required: true },
  },
  { timestamps: true, collection: 'ingredient_master' }
);

// One document per userId + level2 (level2 is unique within the taxonomy)
IngredientMasterSchema.index({ userId: 1, level2: 1 }, { unique: true });

export default models.IngredientMaster ||
  model('IngredientMaster', IngredientMasterSchema);
