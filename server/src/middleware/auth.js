const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models');
const { ApiError } = require('./errors');

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Authentication required');
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new ApiError(401, 'Invalid or expired token');
    }
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) throw new ApiError(401, 'Account not found or disabled');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  if (!roles.includes(req.user.role)) return next(new ApiError(403, `Requires role: ${roles.join(' or ')}`));
  next();
};

module.exports = { signToken, requireAuth, requireRole };
