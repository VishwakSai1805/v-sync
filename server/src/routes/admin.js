const router = require('express').Router();
const { User, Issue, IssueReport, Reservation, Loan, KarmaWallet, ApprovalRequest, Resource } = require('../models');
const { ah, ApiError } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const karma = require('../services/karma');
const { runAllSweeps } = require('../jobs/sweeps');

router.use(requireAuth);

// Maintenance staff list is needed by admin to assign tickets.
router.get('/staff', requireRole('admin'), ah(async (req, res) => {
  const staff = await User.find({ role: 'maintenance', isActive: true }).select('name email department staffId');
  const counts = await Issue.aggregate([
    { $match: { status: { $in: ['open', 'in_progress'] }, assignedTo: { $ne: null } } },
    { $group: { _id: '$assignedTo', open: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(counts.map((c) => [String(c._id), c.open]));
  res.json({ staff: staff.map((s) => ({ ...s.toJSON(), openTickets: map[String(s._id)] || 0 })) });
}));

router.use(requireRole('admin'));

router.get('/users', ah(async (req, res) => {
  const filter = req.query.role ? { role: req.query.role } : {};
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(500);
  const wallets = await KarmaWallet.find({ user: { $in: users.map((u) => u._id) } });
  const wmap = Object.fromEntries(wallets.map((w) => [String(w.user), w]));
  res.json({ users: users.map((u) => ({ ...u.toJSON(), wallet: wmap[String(u._id)] || null })) });
}));

// Create staff accounts (faculty / warden / maintenance / admin) or students.
router.post('/users', ah(async (req, res) => {
  const { name, email, password, role, department, facultyId, staffId, hostelBlock, studentId, year } = req.body;
  // Password is optional: without one, the person signs in with Google using this email.
  if (!name || !email || !role) throw new ApiError(400, 'name, email and role are required');
  if (password !== undefined && password !== '' && String(password).length < 6) throw new ApiError(400, 'Password must be at least 6 characters');
  if (!User.ROLES.includes(role)) throw new ApiError(400, 'Invalid role');
  const user = await User.create({ name, email, password: password || undefined, role, department, facultyId, staffId, hostelBlock, studentId, year });
  if (role === 'student') await karma.createWallet(user._id);
  res.status(201).json({ user });
}));

router.patch('/users/:id', ah(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (req.body.isActive !== undefined) {
    if (String(user._id) === String(req.user._id)) throw new ApiError(400, 'You cannot disable yourself');
    user.isActive = Boolean(req.body.isActive);
  }
  await user.save();
  res.json({ user });
}));

// Reports & Analytics (Level-1 DFD process 6.0).
router.get('/analytics', ah(async (req, res) => {
  const [
    users, students, issuesByStatus, issuesByCategory, totalReports, duplicateReports,
    reservationsByStatus, loansByStatus, wallets, pendingApprovals, resources,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: 'student' }),
    Issue.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Issue.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
    IssueReport.countDocuments({}),
    IssueReport.countDocuments({ isDuplicate: true }),
    Reservation.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Loan.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    KarmaWallet.find({}).select('status balance').lean(),
    ApprovalRequest.countDocuments({ status: { $in: ['pending_proctor', 'pending_warden'] } }),
    Resource.aggregate([{ $group: { _id: '$kind', count: { $sum: 1 } } }]),
  ]);
  const toMap = (arr, key = 'count') => Object.fromEntries(arr.map((x) => [x._id, x[key]]));
  const resv = toMap(reservationsByStatus);
  const finished = (resv.completed || 0) + (resv.ghosted || 0);
  res.json({
    users, students,
    issues: { byStatus: toMap(issuesByStatus), byCategory: toMap(issuesByCategory) },
    reports: {
      total: totalReports, duplicates: duplicateReports,
      // Share of incoming reports absorbed into an existing master ticket.
      ticketReductionPct: totalReports ? Math.round((duplicateReports / totalReports) * 100) : 0,
    },
    reservations: { byStatus: resv, ghostRatePct: finished ? Math.round(((resv.ghosted || 0) / finished) * 100) : 0 },
    loans: { byStatus: toMap(loansByStatus) },
    wallets: {
      byStatus: wallets.reduce((m, w) => ({ ...m, [w.status]: (m[w.status] || 0) + 1 }), {}),
      totalKarma: wallets.reduce((s, w) => s + (w.balance || 0), 0),
    },
    pendingApprovals,
    resources: toMap(resources),
  });
}));

// Manually trigger the anti-ghosting / overdue sweeps (also runs every minute).
router.post('/run-sweeps', ah(async (req, res) => {
  res.json(await runAllSweeps());
}));

module.exports = router;
