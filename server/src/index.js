const mongoose = require('mongoose');
const config = require('./config');
const { createApp } = require('./app');
const { ensureDefaultRules } = require('./services/karma');
const { startScheduler } = require('./jobs/sweeps');

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');
  await ensureDefaultRules();
  // Hosts without a shell (e.g. Render free tier): load demo data on first boot.
  if (process.env.SEED_DEMO_DATA === 'true') {
    const { User } = require('./models');
    if ((await User.estimatedDocumentCount()) === 0) {
      console.log('Empty database and SEED_DEMO_DATA=true: loading demo data');
      await require('./seed').seedDemoData();
    }
  }
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
