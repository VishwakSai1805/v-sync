const mongoose = require('mongoose');

// LOAN entity. State machine (Resource Loan lifecycle diagram):
//   requested -> approved -> borrowed -> returned
//   requested -> rejected
//   borrowed  -> overdue  (due date exceeded) -> returned
const STATUSES = ['requested', 'approved', 'rejected', 'borrowed', 'overdue', 'returned', 'cancelled'];

const loanSchema = new mongoose.Schema(
  {
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    borrower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, default: '', trim: true },
    requestDate: { type: Date, default: Date.now },
    issueDate: { type: Date, default: null },
    dueDate: { type: Date, required: true },
    returnDate: { type: Date, default: null },
    status: { type: String, enum: STATUSES, default: 'requested' },
    // Lender's rating of the borrower (1-5) captured on return -> Trust & Rating algorithm
    borrowerRating: { type: Number, min: 1, max: 5, default: null },
    overduePenaltyApplied: { type: Boolean, default: false },
  },
  { timestamps: true }
);

loanSchema.statics.STATUSES = STATUSES;
loanSchema.statics.OPEN = ['requested', 'approved', 'borrowed', 'overdue'];

module.exports = mongoose.model('Loan', loanSchema);
