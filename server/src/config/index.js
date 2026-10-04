require('dotenv').config({ quiet: true });

const list = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

module.exports = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vsync',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Comma-separated institutional domains, e.g. "vitstudent.ac.in,vit.ac.in".
  // Empty = any domain allowed (useful for local dev only).
  allowedEmailDomains: list(process.env.ALLOWED_EMAIL_DOMAINS),
  clientOrigins: list(process.env.CLIENT_ORIGIN).length ? list(process.env.CLIENT_ORIGIN) : ['*'],
  // Disable the background scheduler (tests trigger sweeps manually).
  enableScheduler: process.env.ENABLE_SCHEDULER !== 'false',
  karma: {
    startingBalance: Number(process.env.KARMA_STARTING_BALANCE) || 100,
  },
};
