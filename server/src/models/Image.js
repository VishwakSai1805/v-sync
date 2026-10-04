const mongoose = require('mongoose');

// Images are stored in MongoDB (not on local disk) so uploads survive restarts
// on ephemeral hosts like Render. Served at GET /api/images/:id.
const imageSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Image', imageSchema);
