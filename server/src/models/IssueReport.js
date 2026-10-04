const mongoose = require('mongoose');

// ISSUE_REPORT entity — every individual student submission, kept even when it
// is a duplicate so the admin can see who reported what (N reports -> 1 ISSUE).
const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    issue: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    category: { type: String, required: true },
    building: { type: String, required: true },
    room: { type: String, default: '' },
    image: { type: mongoose.Schema.Types.ObjectId, ref: 'Image', default: null },
    isDuplicate: { type: Boolean, default: false },
    similarityScore: { type: Number, default: null },
  },
  { timestamps: { createdAt: 'timestamp', updatedAt: false } }
);

module.exports = mongoose.model('IssueReport', reportSchema);
