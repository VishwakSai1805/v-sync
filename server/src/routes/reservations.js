const router = require('express').Router();
const { Reservation, Resource } = require('../models');
const { ah, ApiError } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const karma = require('../services/karma');
const { validateWindow, createConfirmed } = require('../services/reservations');

router.use(requireAuth);

const populate = (q) => q.populate('resource', 'name category location restricted').populate('user', 'name department');

async function ghostGrace() {
  const rule = await karma.getRule('GHOST_RESERVATION');
  return rule ? rule.gracePeriod : 10;
}

// GET /api/reservations?scope=mine|all&status=
router.get('/', ah(async (req, res) => {
  const { scope, status, resourceId } = req.query;
  const filter = {};
  if (scope === 'all' && ['admin', 'warden', 'faculty'].includes(req.user.role)) {
    // staff view
  } else {
    filter.user = req.user._id;
  }
  if (status) filter.status = { $in: String(status).split(',') };
  if (resourceId) filter.resource = resourceId;
  const reservations = await populate(Reservation.find(filter).sort({ startTime: -1 }).limit(300));
  res.json({ reservations, ghostGraceMinutes: await ghostGrace() });
}));

// Book a facility. Restricted facilities must go through /api/approvals instead.
router.post('/', requireRole('student'), ah(async (req, res) => {
  const { resourceId, startTime, endTime, purpose } = req.body;
  const start = new Date(startTime);
  const end = new Date(endTime);
  validateWindow(start, end);
  const resource = await Resource.findById(resourceId);
  if (!resource || resource.kind !== 'facility') throw new ApiError(404, 'Facility not found');
  if (resource.restricted) throw new ApiError(403, 'This facility is restricted. Submit an access request (Proctor → Warden approval).');
  if (await karma.isRestricted(req.user._id)) throw new ApiError(403, 'Your karma wallet is restricted. Earn karma to book again.');
  const reservation = await createConfirmed({ resourceId, userId: req.user._id, start, end, purpose });
  res.status(201).json({ reservation: await populate(Reservation.findById(reservation._id)), ghostGraceMinutes: await ghostGrace() });
}));

async function loadOwn(req) {
  const r = await Reservation.findById(req.params.id).populate('resource', 'name');
  if (!r) throw new ApiError(404, 'Reservation not found');
  if (r.user.toString() !== req.user._id.toString()) throw new ApiError(403, 'Not your reservation');
  return r;
}

router.post('/:id/cancel', ah(async (req, res) => {
  const r = await loadOwn(req);
  if (!['requested', 'confirmed'].includes(r.status)) throw new ApiError(409, `Cannot cancel a ${r.status} reservation`);
  const rule = await karma.getRule('LATE_CANCELLATION');
  const minutesToStart = (r.startTime - Date.now()) / 60000;
  r.status = 'cancelled';
  await r.save();
  let penalised = false;
  if (rule && rule.active !== false && minutesToStart < rule.gracePeriod) {
    await karma.applyRule(r.user, 'LATE_CANCELLATION', { reason: `Late cancellation of ${r.resource.name}`, refModel: 'Reservation', refId: r._id });
    penalised = true;
  }
  res.json({ reservation: await populate(Reservation.findById(r._id)), penalised });
}));

// Check-in is allowed from 15 min before start until the ghost deadline.
router.post('/:id/check-in', ah(async (req, res) => {
  const r = await loadOwn(req);
  if (r.status !== 'confirmed') throw new ApiError(409, `Cannot check in: reservation is ${r.status}`);
  const now = Date.now();
  const grace = await ghostGrace();
  if (now < r.startTime.getTime() - 15 * 60000) throw new ApiError(400, 'Check-in opens 15 minutes before your slot');
  if (now > r.startTime.getTime() + grace * 60000) throw new ApiError(409, 'Check-in window has closed');
  r.status = 'in_use';
  r.checkInTime = new Date();
  await r.save();
  res.json({ reservation: await populate(Reservation.findById(r._id)) });
}));

router.post('/:id/check-out', ah(async (req, res) => {
  const r = await loadOwn(req);
  if (r.status !== 'in_use') throw new ApiError(409, `Cannot check out: reservation is ${r.status}`);
  r.status = 'completed';
  r.checkOutTime = new Date();
  await r.save();
  await karma.applyRule(r.user, 'COMPLETED_RESERVATION', { reason: `Completed booking of ${r.resource.name}`, refModel: 'Reservation', refId: r._id, silent: true });
  res.json({ reservation: await populate(Reservation.findById(r._id)) });
}));

module.exports = router;
