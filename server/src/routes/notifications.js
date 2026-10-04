const router = require('express').Router();
const { Notification } = require('../models');
const { ah } = require('../middleware/errors');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', ah(async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  const unread = await Notification.countDocuments({ user: req.user._id, read: false });
  res.json({ notifications, unread });
}));

router.post('/read-all', ah(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
  res.json({ ok: true });
}));

router.post('/:id/read', ah(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { read: true } });
  res.json({ ok: true });
}));

module.exports = router;
