const mongoose = require('mongoose');

// RESOURCE entity. Two kinds share one collection:
//  - kind "p2p":      personal gear a student lends (owner = that student) -> LOAN flow
//  - kind "facility": campus space/equipment booked by time slot (owner = null) -> RESERVATION flow
// Facilities with `restricted: true` (e.g. hardware lab after hours) require the
// Multi-Tier Approval Workflow (Proctor -> Warden) before a reservation is created.
const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    category: { type: String, required: true, trim: true },
    location: { type: String, default: '', trim: true },
    kind: { type: String, enum: ['p2p', 'facility'], required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    availabilityStatus: {
      type: String,
      enum: ['available', 'reserved', 'lent', 'unavailable'],
      default: 'available',
    },
    restricted: { type: Boolean, default: false },
    capacity: { type: Number, default: 1 },
    image: { type: mongoose.Schema.Types.ObjectId, ref: 'Image', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Resource', resourceSchema);
