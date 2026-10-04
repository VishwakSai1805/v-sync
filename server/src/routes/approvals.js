const router = require('express').Router();
const { ApprovalRequest, Resource, User } = require('../models');
const { ah, ApiError } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateWindow, assertSlotFree, createConfirmed } = require('../services/reservations');
const karma = require('../services/karma');
const { notify } = require('../services/notify');

router.use(requireAuth);

const populate = (q) =>
  q.populate('student', 'name email department year hostelBlock trustScore')
    .populate('resource', 'name location category')
    .populate('proctorDecision.by', 'name')
    .populate('wardenDecision.by', 'name')
    .populate('reservation', 'status startTime endTime');

// Students see their own; faculty (proctor) see the proctor queue; wardens the
// warden queue; admin sees everything. ?status= filters.
router.get('/', ah(async (req, res) => {
  const filter = {};
  const { role } = req.user;
  if (role === 'student') filter.student = req.user._id;
  else if (role === 'faculty') filter.$or = [{ status: 'pending_proctor' }, { 'proctorDecision.by': req.user._id }];
  else if (role === 'warden') filter.$or = [{ status: 'pending_warden' }, { 'wardenDecision.by': req.user._id }];
  else if (role !== 'admin') throw new ApiError(403, 'Not allowed');
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  const requests = await populate(ApprovalRequest.find(filter).sort({ createdAt: -1 }).limit(200));
  res.json({ requests });
}));

router.post('/', requireRole('student'), ah(async (req, res) => {
  const { resourceId, startTime, endTime, reason } = req.body;
  if (!reason || String(reason).trim().length < 10) throw new ApiError(400, 'Please give a reason (at least 10 characters)');
  const start = new Date(startTime);
  const end = new Date(endTime);
  validateWindow(start, end);
  const resource = await Resource.findById(resourceId);
  if (!resource || resource.kind !== 'facility') throw new ApiError(404, 'Facility not found');
  if (!resource.restricted) throw new ApiError(400, 'This facility does not need approval — book it directly');
  if (await karma.isRestricted(req.user._id)) throw new ApiError(403, 'Your karma wallet is restricted.');
  await assertSlotFree(resource, start, end);
  const reqDoc = await ApprovalRequest.create({ student: req.user._id, resource: resource._id, startTime: start, endTime: end, reason });
  const proctors = await User.find({ role: 'faculty', isActive: true }).select('_id');
  await Promise.all(proctors.map((p) => notify(p._id, `Access request from ${req.user.name} for ${resource.name}`, { type: 'approval', link: '/approvals' })));
  res.status(201).json({ request: await populate(ApprovalRequest.findById(reqDoc._id)) });
}));

// Tier 1 (faculty / proctor) and tier 2 (warden) decisions.
router.post('/:id/decide', requireRole('faculty', 'warden', 'admin'), ah(async (req, res) => {
  const { decision, remarks = '' } = req.body;
  if (!['approved', 'rejected'].includes(decision)) throw new ApiError(400, 'decision must be approved or rejected');
  const ar = await ApprovalRequest.findById(req.params.id).populate('resource', 'name');
  if (!ar) throw new ApiError(404, 'Request not found');
  const role = req.user.role;
  const stage = ar.status;
  if (stage === 'pending_proctor' && !['faculty', 'admin'].includes(role)) throw new ApiError(403, 'Awaiting Faculty Proctor decision');
  if (stage === 'pending_warden' && !['warden', 'admin'].includes(role)) throw new ApiError(403, 'Awaiting Hostel Warden decision');
  if (!['pending_proctor', 'pending_warden'].includes(stage)) throw new ApiError(409, `Request is already ${stage}`);

  const record = { by: req.user._id, decision, remarks, at: new Date() };
  if (stage === 'pending_proctor') ar.proctorDecision = record;
  else ar.wardenDecision = record;

  if (decision === 'rejected') {
    ar.status = 'rejected';
    await ar.save();
    await notify(ar.student, `Access request for ${ar.resource.name} was rejected by the ${stage === 'pending_proctor' ? 'Proctor' : 'Warden'}.${remarks ? ` Remarks: ${remarks}` : ''}`, { type: 'approval', link: '/approvals' });
  } else if (stage === 'pending_proctor') {
    ar.status = 'pending_warden';
    await ar.save();
    const wardens = await User.find({ role: 'warden', isActive: true }).select('_id');
    await Promise.all(wardens.map((w) => notify(w._id, `Proctor-approved access request for ${ar.resource.name} needs your sign-off`, { type: 'approval', link: '/approvals' })));
    await notify(ar.student, `Proctor approved your request for ${ar.resource.name}. Now waiting for the Warden.`, { type: 'approval', link: '/approvals' });
  } else {
    // Final approval -> auto-create the reservation (slot may have been taken meanwhile).
    const reservation = await createConfirmed({
      resourceId: ar.resource._id, userId: ar.student, start: ar.startTime, end: ar.endTime,
      purpose: ar.reason, approvalRequest: ar._id,
    });
    ar.status = 'approved';
    ar.reservation = reservation._id;
    await ar.save();
    await notify(ar.student, `Fully approved! Your ${ar.resource.name} slot is booked — remember to check in on time.`, { type: 'approval', link: '/facilities' });
  }
  res.json({ request: await populate(ApprovalRequest.findById(ar._id)) });
}));

router.post('/:id/cancel', requireRole('student'), ah(async (req, res) => {
  const ar = await ApprovalRequest.findById(req.params.id);
  if (!ar) throw new ApiError(404, 'Request not found');
  if (ar.student.toString() !== req.user._id.toString()) throw new ApiError(403, 'Not your request');
  if (!['pending_proctor', 'pending_warden'].includes(ar.status)) throw new ApiError(409, `Request is already ${ar.status}`);
  ar.status = 'cancelled';
  await ar.save();
  res.json({ request: await populate(ApprovalRequest.findById(ar._id)) });
}));

module.exports = router;
