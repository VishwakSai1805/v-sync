const router = require('express').Router();
const config = require('../config');
const { User } = require('../models');
const { ah, ApiError } = require('../middleware/errors');
const { signToken, requireAuth } = require('../middleware/auth');
const karma = require('../services/karma');

function checkInstitutionalEmail(email) {
  if (!config.allowedEmailDomains.length) return;
  const domain = String(email).split('@')[1]?.toLowerCase();
  if (!domain || !config.allowedEmailDomains.includes(domain)) {
    throw new ApiError(400, `Use your institutional email (${config.allowedEmailDomains.map((d) => '@' + d).join(', ')})`);
  }
}

// Self-registration is students only. Faculty / Warden / Maintenance / Admin
// accounts are created by an Admin (see routes/admin.js) or the seed script.
router.post('/register', ah(async (req, res) => {
  const { name, email, password, studentId, department, year, hostelBlock } = req.body;
  if (!name || !email || !password) throw new ApiError(400, 'name, email and password are required');
  if (String(password).length < 6) throw new ApiError(400, 'Password must be at least 6 characters');
  checkInstitutionalEmail(email);
  const user = await User.create({ name, email, password, role: 'student', studentId, department, year, hostelBlock });
  await karma.createWallet(user._id);
  res.status(201).json({ token: signToken(user), user });
}));

router.post('/login', ah(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'email and password are required');
  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) throw new ApiError(401, 'Invalid email or password');
  if (!user.isActive) throw new ApiError(403, 'Account disabled');
  res.json({ token: signToken(user), user });
}));

router.get('/me', requireAuth, ah(async (req, res) => {
  const wallet = req.user.role === 'student' ? await karma.getWallet(req.user._id) : null;
  res.json({ user: req.user, wallet });
}));

// Update own profile details. Email and role are not self-editable
// (identity is tied to the institutional email; roles are assigned by Admin).
router.patch('/me', requireAuth, ah(async (req, res) => {
  if (req.body.password !== undefined) throw new ApiError(400, 'Use POST /api/auth/change-password to change your password');
  const allowed = ['name', 'department', 'year', 'hostelBlock', 'studentId'];
  for (const k of allowed) {
    if (req.body[k] === undefined) continue;
    let v = typeof req.body[k] === 'string' ? req.body[k].trim() : req.body[k];
    if (k === 'name' && !v) throw new ApiError(400, 'Name cannot be empty');
    if (k === 'year') {
      if (v === '' || v === null) v = undefined;
      else if (!(Number(v) >= 1 && Number(v) <= 6)) throw new ApiError(400, 'Year must be between 1 and 6');
      else v = Number(v);
    }
    req.user[k] = v;
  }
  await req.user.save();
  res.json({ user: req.user });
}));

// Changing a password requires the current one, so a stolen/left-open session
// token alone cannot be used to take over the account.
router.post('/change-password', requireAuth, ah(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new ApiError(400, 'currentPassword and newPassword are required');
  if (String(newPassword).length < 6) throw new ApiError(400, 'New password must be at least 6 characters');
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) throw new ApiError(400, 'Current password is incorrect');
  if (currentPassword === newPassword) throw new ApiError(400, 'New password must be different from the current one');
  user.password = newPassword;
  await user.save();
  res.json({ ok: true });
}));

module.exports = router;
