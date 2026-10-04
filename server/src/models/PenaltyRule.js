const mongoose = require('mongoose');

// PENALTY_RULE entity — the configurable karma economy. Requirement volatility
// (Karma point values) is handled by keeping every rule in the DB and editable
// by Admin, instead of hard-coding numbers.
//   type "deduct": penalties (e.g. GHOST_RESERVATION)
//   type "earn":   rewards  (e.g. LEND_ITEM)
const penaltyRuleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    penaltyType: { type: String, enum: ['earn', 'deduct'], required: true },
    points: { type: Number, required: true, min: 0 },
    // Minutes of grace (used by GHOST_RESERVATION check-in window, LATE_RETURN)
    gracePeriod: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PenaltyRule', penaltyRuleSchema);
