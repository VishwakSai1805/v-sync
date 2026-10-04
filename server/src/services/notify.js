const { Notification } = require('../models');

async function notify(userId, message, { type = 'info', link = '' } = {}) {
  if (!userId) return null;
  try {
    return await Notification.create({ user: userId, message, type, link });
  } catch (err) {
    // Notifications must never break the primary operation.
    console.error('notify failed:', err.message);
    return null;
  }
}

module.exports = { notify };
