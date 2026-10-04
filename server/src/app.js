const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/errors');

function createApp() {
  const app = express();
  app.use(cors({ origin: config.clientOrigins.includes('*') ? true : config.clientOrigins }));
  app.use(express.json({ limit: '1mb' }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'v-sync', time: new Date() }));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/resources', require('./routes/resources'));
  app.use('/api/loans', require('./routes/loans'));
  app.use('/api/reservations', require('./routes/reservations'));
  app.use('/api/issues', require('./routes/issues'));
  app.use('/api/karma', require('./routes/karma'));
  app.use('/api/approvals', require('./routes/approvals'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/images', require('./routes/images'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
