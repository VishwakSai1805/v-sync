const mongoose = require('mongoose');

// KARMA_TRANSACTION entity — immutable ledger rows. Wallet balance is always
// the sum of its transactions (append-only ledger).
const txSchema = new mongoose.Schema(
  {
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'KarmaWallet', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    points: { type: Number, required: true }, // signed: +earn / -deduct
    type: { type: String, enum: ['earn', 'deduct', 'adjust'], required: true },
    ruleCode: { type: String, default: null },
    reason: { type: String, default: '' },
    refModel: { type: String, default: null },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    balanceAfter: { type: Number, required: true },
  },
  { timestamps: { createdAt: 'timestamp', updatedAt: false } }
);

// Idempotency: the same rule can only fire once for the same referenced object
// (e.g. a ghosted reservation can't be penalised twice by overlapping sweeps).
txSchema.index({ user: 1, ruleCode: 1, refId: 1 });

module.exports = mongoose.model('KarmaTransaction', txSchema);
