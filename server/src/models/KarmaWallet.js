const mongoose = require('mongoose');

// KARMA_WALLET entity (1:1 with STUDENT). Account standing state machine
// (Karma Wallet state diagram):
//   active -> penalty_applied   (violation, balance still > 0)
//   penalty_applied -> restricted (balance <= 0)
//   restricted / penalty_applied -> active (earn points, balance > 0 again)
const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    balance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    totalDeducted: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'penalty_applied', 'restricted'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('KarmaWallet', walletSchema);
