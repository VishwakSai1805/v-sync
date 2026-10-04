const router = require('express').Router();
const { User, Resource, Loan, Issue, IssueReport, Reservation, ApprovalRequest } = require('../models');
const { ah, ApiError } = require('../middleware/errors');
const { requireAuth } = require('../middleware/auth');
const karma = require('../services/karma');

router.use(requireAuth);

const countBy = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.count]));

// Activity numbers shown on a student's profile. Uses only simple queries so it
// behaves the same on every MongoDB-compatible backend.
async function studentStats(userId) {
  const [itemsListed, lentLoans, borrowedLoans, reports, newTickets, reservations] = await Promise.all([
    Resource.countDocuments({ kind: 'p2p', owner: userId }),
    Loan.find({ lender: userId }).select('status').lean(),
    Loan.find({ borrower: userId }).select('status').lean(),
    IssueReport.countDocuments({ reporter: userId }),
    Issue.countDocuments({ createdBy: userId }),
    Reservation.find({ user: userId }).select('status').lean(),
  ]);
  const tally = (rows) => rows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
  const lent = tally(lentLoans);
  const borrowed = tally(borrowedLoans);
  const resv = tally(reservations);
  return {
    itemsListed,
    timesLent: lent.returned || 0,
    activeLending: (lent.approved || 0) + (lent.borrowed || 0) + (lent.overdue || 0),
    timesBorrowed: borrowed.returned || 0,
    activeBorrowing: (borrowed.approved || 0) + (borrowed.borrowed || 0) + (borrowed.overdue || 0),
    issuesReported: reports,
    ticketsOpened: newTickets,
    bookingsCompleted: resv.completed || 0,
    bookingsGhosted: resv.ghosted || 0,
  };
}

function trustBreakdown(u) {
  const returns = u.onTimeReturns + u.lateReturns;
  return {
    trustScore: u.trustScore,
    averageRating: u.ratingCount ? Number((u.ratingSum / u.ratingCount).toFixed(2)) : null,
    ratingCount: u.ratingCount,
    onTimeReturns: u.onTimeReturns,
    lateReturns: u.lateReturns,
    onTimeRatePct: returns ? Math.round((u.onTimeReturns / returns) * 100) : null,
  };
}

// GET /api/users/:id/profile   (":id" may be "me")
// Everyone signed in can see a student's public profile (that's how lenders
// judge trust). Private data — email, karma ledger standing, bookings — is only
// returned to the profile owner and admins.
router.get('/:id/profile', ah(async (req, res) => {
  const id = req.params.id === 'me' ? req.user._id : req.params.id;
  const user = await User.findById(id).select('+password');
  if (!user || !user.isActive) throw new ApiError(404, 'User not found');
  const isSelf = String(user._id) === String(req.user._id);
  const canSeePrivate = isSelf || req.user.role === 'admin';

  const profile = {
    _id: user._id,
    name: user.name,
    role: user.role,
    department: user.department,
    year: user.year,
    avatarUrl: user.avatarUrl || null,
    memberSince: user.createdAt,
  };
  let stats = null;
  let trust = null;
  let items = [];
  let wallet = null;
  let staffStats = null;

  if (user.role === 'student') {
    trust = trustBreakdown(user);
    stats = await studentStats(user._id);
    items = await Resource.find({ kind: 'p2p', owner: user._id }).select('name category availabilityStatus image').sort({ createdAt: -1 }).limit(24);
  } else if (canSeePrivate) {
    if (user.role === 'maintenance') {
      staffStats = countBy(await Issue.aggregate([{ $match: { assignedTo: user._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]));
    } else if (user.role === 'faculty' || user.role === 'warden') {
      const field = user.role === 'faculty' ? 'proctorDecision' : 'wardenDecision';
      const decided = await ApprovalRequest.find({ [`${field}.by`]: user._id }).select(field).lean();
      staffStats = decided.reduce((m, r) => ({ ...m, [r[field].decision]: (m[r[field].decision] || 0) + 1 }), {});
    }
  }

  if (canSeePrivate) {
    Object.assign(profile, {
      email: user.email,
      studentId: user.studentId,
      facultyId: user.facultyId,
      staffId: user.staffId,
      hostelBlock: user.hostelBlock,
      // How this account signs in (never the password itself).
      hasPassword: Boolean(user.password),
      googleLinked: Boolean(user.googleId),
    });
    if (user.role === 'student') wallet = await karma.getWallet(user._id);
  } else if (user.role === 'student') {
    profile.studentId = user.studentId; // register number is shown publicly, like on campus ID cards
  }

  res.json({ profile, isSelf, trust, stats, items, wallet, staffStats });
}));

module.exports = router;
