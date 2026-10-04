const mongoose = require('mongoose');

// ISSUE entity — the "master ticket". Several ISSUE_REPORTs are grouped into one
// ISSUE by the Duplicate Detection Engine. State machine (Civic Issue diagram):
//   open -> in_progress -> resolved   (rejected = invalid report, admin only)
const STATUSES = ['open', 'in_progress', 'resolved', 'rejected'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const CATEGORIES = ['electrical', 'plumbing', 'network', 'hvac', 'furniture', 'cleanliness', 'security', 'other'];

const issueSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    category: { type: String, enum: CATEGORIES, required: true },
    building: { type: String, required: true, trim: true },
    room: { type: String, default: '', trim: true },
    location: { type: String, default: '', trim: true }, // display string "building / room"
    image: { type: mongoose.Schema.Types.ObjectId, ref: 'Image', default: null },
    keywords: [{ type: String }],
    status: { type: String, enum: STATUSES, default: 'open' },
    priority: { type: String, enum: PRIORITIES, default: 'low' },
    reportCount: { type: Number, default: 1 },
    reporters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolutionNotes: { type: String, default: '' },
    statusHistory: [
      {
        status: String,
        note: String,
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
      },
    ],
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

issueSchema.statics.STATUSES = STATUSES;
issueSchema.statics.PRIORITIES = PRIORITIES;
issueSchema.statics.CATEGORIES = CATEGORIES;

module.exports = mongoose.model('Issue', issueSchema);
