const router = require('express').Router();
const { Resource, Loan, Reservation } = require('../models');
const { ah, ApiError } = require('../middleware/errors');
const { requireAuth } = require('../middleware/auth');
const { upload, saveImage } = require('../middleware/upload');

router.use(requireAuth);

const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/resources?kind=p2p|facility&category=&q=&mine=true&available=true
router.get('/', ah(async (req, res) => {
  const { kind, category, q, mine, available } = req.query;
  const filter = {};
  if (kind) filter.kind = kind;
  if (category) filter.category = category;
  if (mine === 'true') filter.owner = req.user._id;
  if (available === 'true') filter.availabilityStatus = 'available';
  if (q) {
    const rx = new RegExp(escape(q), 'i');
    filter.$or = [{ name: rx }, { description: rx }, { category: rx }, { location: rx }];
  }
  const resources = await Resource.find(filter)
    .populate('owner', 'name department trustScore ratingCount')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ resources });
}));

router.get('/categories', ah(async (req, res) => {
  const filter = req.query.kind ? { kind: req.query.kind } : {};
  const categories = await Resource.distinct('category', filter);
  res.json({ categories: categories.sort() });
}));

router.get('/:id', ah(async (req, res) => {
  const resource = await Resource.findById(req.params.id).populate('owner', 'name department trustScore ratingCount');
  if (!resource) throw new ApiError(404, 'Resource not found');
  let upcoming = [];
  if (resource.kind === 'facility') {
    upcoming = await Reservation.find({
      resource: resource._id,
      status: { $in: ['confirmed', 'in_use'] },
      endTime: { $gte: new Date() },
    }).select('startTime endTime status').sort({ startTime: 1 }).limit(50);
  }
  res.json({ resource, upcoming });
}));

// Students list their own P2P items; Admin creates campus facilities.
router.post('/', upload.single('image'), ah(async (req, res) => {
  const { name, description, category, location, kind = 'p2p', restricted, capacity } = req.body;
  if (!name || !category) throw new ApiError(400, 'name and category are required');
  if (kind === 'facility' && req.user.role !== 'admin') throw new ApiError(403, 'Only admins can add campus facilities');
  if (kind === 'p2p' && req.user.role !== 'student') throw new ApiError(403, 'Only students can list items for lending');
  const image = await saveImage(req.file, req.user._id);
  const resource = await Resource.create({
    name, description, category, location, kind,
    owner: kind === 'p2p' ? req.user._id : null,
    restricted: kind === 'facility' && (restricted === true || restricted === 'true'),
    capacity: Number(capacity) || 1,
    image,
  });
  res.status(201).json({ resource });
}));

function assertCanEdit(resource, user) {
  const isOwner = resource.owner && resource.owner.toString() === user._id.toString();
  if (!isOwner && user.role !== 'admin') throw new ApiError(403, 'Not allowed to modify this resource');
}

router.patch('/:id', upload.single('image'), ah(async (req, res) => {
  const resource = await Resource.findById(req.params.id);
  if (!resource) throw new ApiError(404, 'Resource not found');
  assertCanEdit(resource, req.user);
  for (const k of ['name', 'description', 'category', 'location']) if (req.body[k] !== undefined) resource[k] = req.body[k];
  if (req.body.availabilityStatus !== undefined) {
    if (!['available', 'unavailable'].includes(req.body.availabilityStatus)) throw new ApiError(400, 'Status can only be set to available/unavailable manually');
    if (resource.availabilityStatus === 'lent') throw new ApiError(409, 'Item is currently lent out');
    resource.availabilityStatus = req.body.availabilityStatus;
  }
  if (req.user.role === 'admin' && req.body.restricted !== undefined) resource.restricted = req.body.restricted === true || req.body.restricted === 'true';
  if (req.user.role === 'admin' && req.body.capacity !== undefined) resource.capacity = Number(req.body.capacity) || 1;
  if (req.file) resource.image = await saveImage(req.file, req.user._id);
  await resource.save();
  res.json({ resource });
}));

router.delete('/:id', ah(async (req, res) => {
  const resource = await Resource.findById(req.params.id);
  if (!resource) throw new ApiError(404, 'Resource not found');
  assertCanEdit(resource, req.user);
  const openLoan = await Loan.findOne({ resource: resource._id, status: { $in: Loan.OPEN } });
  const openRes = await Reservation.findOne({ resource: resource._id, status: { $in: Reservation.ACTIVE } });
  if (openLoan || openRes) throw new ApiError(409, 'Resource has active loans or reservations');
  await resource.deleteOne();
  res.json({ ok: true });
}));

module.exports = router;
