// log_plan (#71, Design §15.7, agreed with Hyoje 8 Nov 2026): plans — records whose start
// is still to come, kept apart from `log` so that Insights, Search and the Calendar's
// counts never see something that may not happen. A plan has a record's shape plus
// `plan`. When it happens (confirmed, or by itself for a "count as done" repeat) a
// record is written to `log` and the plan stays behind as 'done', so a repeat never
// makes the same occurrence twice; a deleted plan stays as 'deleted' for Undo and for
// the same reason.

import mongoose, { Schema } from 'mongoose';
import { LogSchema } from './Log';

const LogPlanSchema = LogSchema.clone();
LogPlanSchema.add({
  plan: {
    state: { type: String, enum: ['open', 'done', 'deleted'], default: 'open' },
    /** The repeat rule that made it, and which occurrence (its local start date). */
    repeatId: { type: Schema.Types.ObjectId, default: null },
    occurrence: { type: String, default: null },
    /** Changed by hand since the rule made it: a rule change leaves it alone. */
    edited: { type: Boolean, default: false },
    /** The record written when it happened (state 'done'). */
    recordId: { type: Schema.Types.ObjectId, default: null },
    /** 'confirmed' (by Hyoje) or 'auto' (a "count as done" repeat). */
    doneBy: { type: String, default: null },
    doneAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
} as any);
LogPlanSchema.set('collection', 'log_plan');
LogPlanSchema.index({ userId: 1, 'plan.state': 1, 'start.datetime': 1 });
// One plan per occurrence of a rule, whatever its state.
LogPlanSchema.index(
  { userId: 1, 'plan.repeatId': 1, 'plan.occurrence': 1 },
  { unique: true, partialFilterExpression: { 'plan.repeatId': { $type: 'objectId' } } },
);

export default mongoose.models.LogPlan || mongoose.model('LogPlan', LogPlanSchema);
