const mongoose = require('mongoose');

// RESERVATION entity. State machine (State Transition Diagram #1):
//   requested -> confirmed -> in_use -> completed
//   requested -> cancelled            (student cancels)
//   confirmed -> cancelled            (student cancels before start)
//   confirmed -> ghosted              (no check-in within grace period -> Anti-Ghosting penalty)
const STATUSES = ['requested', 'confirmed', 'in_use', 'completed', 'cancelled', 'ghosted'];

const reservationSchema = new mongoose.Schema(
  {
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: { type: String, enum: STATUSES, default: 'requested' },
    checkInTime: { type: Date, default: null },
    checkOutTime: { type: Date, default: null },
    approvalRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalRequest', default: null },
    penaltyApplied: { type: Boolean, default: false },
    purpose: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

reservationSchema.statics.STATUSES = STATUSES;
reservationSchema.statics.ACTIVE = ['requested', 'confirmed', 'in_use'];

module.exports = mongoose.model('Reservation', reservationSchema);
