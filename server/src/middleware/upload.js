const multer = require('multer');
const { Image } = require('../models');
const { ApiError } = require('./errors');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new ApiError(400, 'Only JPEG, PNG, WEBP or GIF images are allowed'));
  },
});

async function saveImage(file, userId) {
  if (!file) return null;
  const img = await Image.create({ data: file.buffer, contentType: file.mimetype, size: file.size, uploadedBy: userId });
  return img._id;
}

module.exports = { upload, saveImage };
