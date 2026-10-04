const mongoose = require('mongoose');

// Multi-Tier Approval Workflow (Phase 2 feature, built lean).
// Late-night / restricted resource access requests are routed:
//   pending_proctor --(faculty approves)--> pending_warden --(warden approves)--> approved
//   any pending stage --(reject)--> rejected
//   pending_* --(student withdraws)--> cancelled
// On final approval a confirmed RESERVATION is created automatically.
const STATUSES = ['pending_proctor', 'pending_warden', 'approved', 'rejected', 'cancelled'];

const decisionSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decision: { type: String, enum: ['approved', 'rejected'] },
    remarks: { type: String, default: '' },
    at: { type: Date },
  },
  { _id: false }
);

const approvalSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: STATUSES, default: 'pending_proctor' },
    proctorDecision: { type: decisionSchema, default: null },
    wardenDecision: { type: decisionSchema, default: null },
    reservation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', default: null },
  },
  { timestamps: true }
);

approvalSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('ApprovalRequest', approvalSchema);
