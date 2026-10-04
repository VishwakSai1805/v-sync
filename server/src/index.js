const mongoose = require('mongoose');
const config = require('./config');
const { createApp } = require('./app');
const { ensureDefaultRules } = require('./services/karma');
const { startScheduler } = require('./jobs/sweeps');

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');
  await ensureDefaultRules();
  if (config.enableScheduler) {
    startScheduler();
    console.log('Anti-ghosting / overdue scheduler running (every minute)');
  }
  const app = createApp();
  app.listen(config.port, () => console.log(`V-Sync API listening on :${config.port}`));
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
