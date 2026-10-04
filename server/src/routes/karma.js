const router = require('express').Router();
const { KarmaWallet, KarmaTransaction, PenaltyRule, User } = require('../models');
const { ah, ApiError } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const karma = require('../services/karma');

router.use(requireAuth);

router.get('/wallet', requireRole('student'), ah(async (req, res) => {
  const wallet = await karma.getWallet(req.user._id);
  const transactions = await KarmaTransaction.find({ user: req.user._id }).sort({ timestamp: -1 }).limit(100);
  res.json({ wallet, transactions });
}));

router.get('/leaderboard', ah(async (req, res) => {
  const wallets = await KarmaWallet.find({}).sort({ balance: -1 }).limit(20).populate('user', 'name department year');
  res.json({ leaderboard: wallets.filter((w) => w.user).map((w, i) => ({ rank: i + 1, name: w.user.name, department: w.user.department, balance: w.balance, status: w.status, userId: w.user._id })) });
}));

router.get('/rules', ah(async (req, res) => {
  res.json({ rules: await PenaltyRule.find({}).sort({ penaltyType: 1, code: 1 }) });
}));

// Admin tunes the economy (requirement volatility: points per rule change often).
router.put('/rules/:id', requireRole('admin'), ah(async (req, res) => {
  const rule = await PenaltyRule.findById(req.params.id);
  if (!rule) throw new ApiError(404, 'Rule not found');
  for (const k of ['points', 'gracePeriod']) {
    if (req.body[k] !== undefined) {
      const v = Number(req.body[k]);
      if (!(v >= 0)) throw new ApiError(400, `${k} must be a non-negative number`);
      rule[k] = v;
    }
  }
  if (req.body.active !== undefined) rule.active = Boolean(req.body.active);
  if (req.body.description !== undefined) rule.description = req.body.description;
  await rule.save();
  res.json({ rule });
}));

// Admin view of any student's wallet + manual adjustment.
router.get('/wallet/:userId', requireRole('admin'), ah(async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) throw new ApiError(404, 'User not found');
  const wallet = await karma.getWallet(user._id);
  const transactions = await KarmaTransaction.find({ user: user._id }).sort({ timestamp: -1 }).limit(100);
  res.json({ user, wallet, transactions });
}));

router.post('/adjust', requireRole('admin'), ah(async (req, res) => {
  const { userId, points, reason } = req.body;
  const p = Number(points);
  if (!p) throw new ApiError(400, 'points must be a non-zero number');
  const user = await User.findOne({ _id: userId, role: 'student' });
  if (!user) throw new ApiError(404, 'Student not found');
  const { wallet } = await karma.adjust(user._id, p, reason, req.user._id);
  res.json({ wallet });
}));

module.exports = router;
