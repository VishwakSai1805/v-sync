const router = require('express').Router();
const { Image } = require('../models');
const { ah, ApiError } = require('../middleware/errors');

// Public (images are referenced from <img src>, which can't send a Bearer token).
// IDs are unguessable ObjectIds.
router.get('/:id', ah(async (req, res) => {
  const img = await Image.findById(req.params.id);
  if (!img) throw new ApiError(404, 'Image not found');
  res.set('Content-Type', img.contentType);
  res.set('Cache-Control', 'public, max-age=604800, immutable');
  res.send(img.data);
}));

module.exports = router;
