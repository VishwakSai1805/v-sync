const router = require('express').Router();
const { Loan, Resource, User } = require('../models');
const { ah, ApiError } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const karma = require('../services/karma');
const { applyLoanOutcome } = require('../services/trust');
const { notify } = require('../services/notify');

router.use(requireAuth, requireRole('student', 'admin'));

const populate = (q) =>
  q.populate('resource', 'name category location image')
    .populate('borrower', 'name department trustScore ratingCount')
    .populate('lender', 'name department trustScore');

// GET /api/loans?role=borrower|lender&status=
router.get('/', ah(async (req, res) => {
  const { role, status } = req.query;
  const me = req.user._id;
  let filter;
  if (role === 'borrower') filter = { borrower: me };
  else if (role === 'lender') filter = { lender: me };
  else if (req.user.role === 'admin' && role === 'all') filter = {};
  else filter = { $or: [{ borrower: me }, { lender: me }] };
  if (status) filter.status = { $in: String(status).split(',') };
  const loans = await populate(Loan.find(filter).sort({ createdAt: -1 }).limit(200));
  res.json({ loans });
}));

// Borrower requests an item. Restricted wallets cannot borrow.
router.post('/', ah(async (req, res) => {
  const { resourceId, dueDate, message } = req.body;
  if (req.user.role !== 'student') throw new ApiError(403, 'Only students can borrow');
  const resource = await Resource.findById(resourceId);
  if (!resource || resource.kind !== 'p2p') throw new ApiError(404, 'Lendable item not found');
  if (resource.owner.toString() === req.user._id.toString()) throw new ApiError(400, 'You cannot borrow your own item');
  if (resource.availabilityStatus !== 'available') throw new ApiError(409, 'Item is not available right now');
  if (await karma.isRestricted(req.user._id)) throw new ApiError(403, 'Your karma wallet is restricted. Earn karma to borrow again.');
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime()) || due <= new Date()) throw new ApiError(400, 'dueDate must be in the future');
  const existing = await Loan.findOne({ resource: resource._id, borrower: req.user._id, status: { $in: Loan.OPEN } });
  if (existing) throw new ApiError(409, 'You already have an open request for this item');
  const loan = await Loan.create({ resource: resource._id, borrower: req.user._id, lender: resource.owner, dueDate: due, message });
  await notify(resource.owner, `${req.user.name} (trust ${req.user.trustScore}) wants to borrow "${resource.name}"`, { type: 'loan', link: '/library?tab=lending' });
  res.status(201).json({ loan: await populate(Loan.findById(loan._id)) });
}));

async function loadLoan(id) {
  const loan = await Loan.findById(id).populate('resource');
  if (!loan) throw new ApiError(404, 'Loan not found');
  return loan;
}
const isLender = (loan, user) => loan.lender.toString() === user._id.toString();
const isBorrower = (loan, user) => loan.borrower.toString() === user._id.toString();
function expect(loan, statuses) {
  if (!statuses.includes(loan.status)) throw new ApiError(409, `Loan is ${loan.status}; expected ${statuses.join('/')}`);
}

// Lender approves -> other pending requests for the same item are auto-rejected.
router.post('/:id/approve', ah(async (req, res) => {
  const loan = await loadLoan(req.params.id);
  if (!isLender(loan, req.user)) throw new ApiError(403, 'Only the lender can approve');
  expect(loan, ['requested']);
  if (loan.resource.availabilityStatus !== 'available') throw new ApiError(409, 'Item is no longer available');
  loan.status = 'approved';
  await loan.save();
  loan.resource.availabilityStatus = 'lent';
  await loan.resource.save();
  const others = await Loan.find({ resource: loan.resource._id, status: 'requested', _id: { $ne: loan._id } });
  for (const o of others) {
    o.status = 'rejected';
    await o.save();
    await notify(o.borrower, `Your request for "${loan.resource.name}" was declined (item lent to someone else).`, { type: 'loan', link: '/library?tab=borrowing' });
  }
  await notify(loan.borrower, `Approved! Collect "${loan.resource.name}" from the lender.`, { type: 'loan', link: '/library?tab=borrowing' });
  res.json({ loan: await populate(Loan.findById(loan._id)) });
}));

router.post('/:id/reject', ah(async (req, res) => {
  const loan = await loadLoan(req.params.id);
  if (!isLender(loan, req.user)) throw new ApiError(403, 'Only the lender can reject');
  expect(loan, ['requested']);
  loan.status = 'rejected';
  await loan.save();
  await notify(loan.borrower, `Your request for "${loan.resource.name}" was declined.`, { type: 'loan', link: '/library?tab=borrowing' });
  res.json({ loan: await populate(Loan.findById(loan._id)) });
}));

// Borrower cancels their own pending request.
router.post('/:id/cancel', ah(async (req, res) => {
  const loan = await loadLoan(req.params.id);
  if (!isBorrower(loan, req.user)) throw new ApiError(403, 'Only the borrower can cancel');
  expect(loan, ['requested', 'approved']);
  const wasApproved = loan.status === 'approved';
  loan.status = 'cancelled';
  await loan.save();
  if (wasApproved) {
    loan.resource.availabilityStatus = 'available';
    await loan.resource.save();
  }
  res.json({ loan: await populate(Loan.findById(loan._id)) });
}));

// Handover: either party confirms the item physically changed hands.
router.post('/:id/handover', ah(async (req, res) => {
  const loan = await loadLoan(req.params.id);
  if (!isLender(loan, req.user) && !isBorrower(loan, req.user)) throw new ApiError(403, 'Not your loan');
  expect(loan, ['approved']);
  loan.status = 'borrowed';
  loan.issueDate = new Date();
  await loan.save();
  const other = isLender(loan, req.user) ? loan.borrower : loan.lender;
  await notify(other, `"${loan.resource.name}" marked as handed over. Due ${loan.dueDate.toDateString()}.`, { type: 'loan', link: '/library' });
  res.json({ loan: await populate(Loan.findById(loan._id)) });
}));

// Lender confirms return and rates the borrower (1-5) -> Trust & Rating + Karma.
router.post('/:id/return', ah(async (req, res) => {
  const loan = await loadLoan(req.params.id);
  if (!isLender(loan, req.user)) throw new ApiError(403, 'Only the lender confirms the return');
  expect(loan, ['borrowed', 'overdue']);
  const rating = req.body.rating !== undefined ? Number(req.body.rating) : null;
  if (rating !== null && !(rating >= 1 && rating <= 5)) throw new ApiError(400, 'rating must be 1-5');
  const now = new Date();
  const onTime = now <= loan.dueDate && loan.status !== 'overdue';
  loan.status = 'returned';
  loan.returnDate = now;
  loan.borrowerRating = rating;
  await loan.save();
  loan.resource.availabilityStatus = 'available';
  await loan.resource.save();

  const borrower = await User.findById(loan.borrower);
  applyLoanOutcome(borrower, { rating, onTime });
  await borrower.save();

  await karma.applyRule(loan.lender, 'LEND_ITEM', { reason: `Lent "${loan.resource.name}"`, refModel: 'Loan', refId: loan._id });
  if (onTime) await karma.applyRule(loan.borrower, 'ON_TIME_RETURN', { reason: `Returned "${loan.resource.name}" on time`, refModel: 'Loan', refId: loan._id });
  await notify(loan.borrower, `Return of "${loan.resource.name}" confirmed${rating ? ` — rated ${rating}/5` : ''}. Trust score: ${borrower.trustScore}.`, { type: 'loan', link: '/library?tab=borrowing' });
  res.json({ loan: await populate(Loan.findById(loan._id)), borrowerTrustScore: borrower.trustScore });
}));

module.exports = router;
