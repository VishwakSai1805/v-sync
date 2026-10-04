// End-to-end API tests for all five features. Needs a throwaway MongoDB:
//   MONGO_URI_TEST=mongodb://127.0.0.1:27017/vsync_test npm test
// The database named in MONGO_URI_TEST is DROPPED before and after the run.
process.env.NODE_ENV = 'test';
process.env.ALLOWED_EMAIL_DOMAINS = 'vitstudent.ac.in';
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const M = require('../src/models');
const karma = require('../src/services/karma');
const { runAllSweeps } = require('../src/jobs/sweeps');

const URI = process.env.MONGO_URI_TEST;
const d = URI ? describe : describe.skip;

d('V-Sync API', () => {
  const app = createApp();
  const api = () => request(app);
  const tok = {};
  const ids = {};
  const auth = (who) => ({ Authorization: `Bearer ${tok[who]}` });

  async function staff(role, email) {
    await M.User.create({ name: role, email, password: 'password123', role });
    const res = await api().post('/api/auth/login').send({ email, password: 'password123' });
    tok[role] = res.body.token;
    return res.body.user;
  }

  beforeAll(async () => {
    await mongoose.connect(URI);
    await mongoose.connection.dropDatabase();
    await karma.ensureDefaultRules();
    await staff('admin', 'admin@vit.ac.in');
    await staff('faculty', 'proctor@vit.ac.in');
    await staff('warden', 'warden@vit.ac.in');
    ids.maint = (await staff('maintenance', 'maint@vit.ac.in'))._id;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe('auth', () => {
    test('rejects non-institutional email', async () => {
      const res = await api().post('/api/auth/register').send({ name: 'X', email: 'x@gmail.com', password: 'secret12' });
      expect(res.status).toBe(400);
    });
    test('registers students with a starting wallet', async () => {
      for (const s of ['alice', 'bob', 'carol']) {
        const res = await api().post('/api/auth/register').send({ name: s, email: `${s}@vitstudent.ac.in`, password: 'secret12' });
        expect(res.status).toBe(201);
        tok[s] = res.body.token;
        ids[s] = res.body.user._id;
      }
      const me = await api().get('/api/auth/me').set(auth('alice'));
      expect(me.body.wallet.balance).toBe(100);
    });
    test('rejects bad credentials and missing token', async () => {
      expect((await api().post('/api/auth/login').send({ email: 'alice@vitstudent.ac.in', password: 'nope' })).status).toBe(401);
      expect((await api().get('/api/auth/me')).status).toBe(401);
    });
  });

  describe('P2P library + trust', () => {
    test('lend -> request -> approve -> handover -> return with rating', async () => {
      let res = await api().post('/api/resources').set(auth('alice')).send({ name: 'Arduino kit', category: 'Electronics', kind: 'p2p' });
      expect(res.status).toBe(201);
      ids.item = res.body.resource._id;

      res = await api().post('/api/loans').set(auth('alice')).send({ resourceId: ids.item, dueDate: new Date(Date.now() + 86400000) });
      expect(res.status).toBe(400); // own item

      res = await api().post('/api/loans').set(auth('bob')).send({ resourceId: ids.item, dueDate: new Date(Date.now() + 86400000) });
      expect(res.status).toBe(201);
      ids.loanBob = res.body.loan._id;
      res = await api().post('/api/loans').set(auth('carol')).send({ resourceId: ids.item, dueDate: new Date(Date.now() + 86400000) });
      ids.loanCarol = res.body.loan._id;

      expect((await api().post(`/api/loans/${ids.loanBob}/approve`).set(auth('bob'))).status).toBe(403);
      res = await api().post(`/api/loans/${ids.loanBob}/approve`).set(auth('alice'));
      expect(res.body.loan.status).toBe('approved');
      const carolLoan = await M.Loan.findById(ids.loanCarol);
      expect(carolLoan.status).toBe('rejected'); // auto-rejected competing request

      res = await api().post(`/api/loans/${ids.loanBob}/handover`).set(auth('bob'));
      expect(res.body.loan.status).toBe('borrowed');
      res = await api().post(`/api/loans/${ids.loanBob}/return`).set(auth('alice')).send({ rating: 5 });
      expect(res.body.loan.status).toBe('returned');
      expect(res.body.borrowerTrustScore).toBeGreaterThan(50);

      const aliceWallet = await karma.getWallet(ids.alice);
      expect(aliceWallet.balance).toBe(110); // LEND_ITEM +10
      const item = await M.Resource.findById(ids.item);
      expect(item.availabilityStatus).toBe('available');
    });

    test('overdue loan sweep penalises borrower once', async () => {
      const res = await api().post('/api/loans').set(auth('carol')).send({ resourceId: ids.item, dueDate: new Date(Date.now() + 60000) });
      const loanId = res.body.loan._id;
      await api().post(`/api/loans/${loanId}/approve`).set(auth('alice'));
      await api().post(`/api/loans/${loanId}/handover`).set(auth('alice'));
      const later = new Date(Date.now() + 5 * 60000);
      await runAllSweeps(later);
      await runAllSweeps(later);
      expect((await M.Loan.findById(loanId)).status).toBe('overdue');
      const w = await karma.getWallet(ids.carol);
      expect(w.balance).toBe(85); // single LATE_RETURN -15
    });
  });

  describe('Civic issue tracker + duplicate detection', () => {
    test('first report creates a master ticket, rewording merges', async () => {
      let res = await api().post('/api/issues').set(auth('alice')).send({ title: 'WiFi not working', description: 'router down', category: 'network', building: 'SJT', room: '401' });
      expect(res.status).toBe(201);
      expect(res.body.duplicate).toBe(false);
      ids.issue = res.body.issue._id;

      res = await api().post('/api/issues').set(auth('bob')).send({ title: 'Wi-Fi is down', description: 'internet not connecting', category: 'network', building: 'sjt', room: '401' });
      expect(res.status).toBe(200);
      expect(res.body.duplicate).toBe(true);
      expect(res.body.issue._id).toBe(ids.issue);
      expect(res.body.issue.reportCount).toBe(2);
      expect(res.body.issue.priority).toBe('medium');

      res = await api().post('/api/issues').set(auth('bob')).send({ title: 'wifi down', category: 'network', building: 'SJT', room: '401' });
      expect(res.status).toBe(409); // same student twice

      res = await api().post('/api/issues').set(auth('carol')).send({ title: 'Fan making noise', category: 'electrical', building: 'SJT', room: '401' });
      expect(res.body.duplicate).toBe(false);
      expect(await M.IssueReport.countDocuments()).toBe(3);
    });

    test('admin assigns, maintenance resolves, reporter gets bonus', async () => {
      expect((await api().patch(`/api/issues/${ids.issue}/status`).set(auth('maintenance')).send({ status: 'in_progress' })).status).toBe(403);
      let res = await api().patch(`/api/issues/${ids.issue}/assign`).set(auth('admin')).send({ staffId: ids.maint });
      expect(res.body.issue.assignedTo._id).toBe(String(ids.maint));
      res = await api().patch(`/api/issues/${ids.issue}/status`).set(auth('maintenance')).send({ status: 'resolved' });
      expect(res.status).toBe(409); // must go through in_progress
      await api().patch(`/api/issues/${ids.issue}/status`).set(auth('maintenance')).send({ status: 'in_progress' });
      res = await api().patch(`/api/issues/${ids.issue}/status`).set(auth('maintenance')).send({ status: 'resolved', note: 'Router replaced' });
      expect(res.body.issue.status).toBe('resolved');
      const tx = await M.KarmaTransaction.findOne({ user: ids.alice, ruleCode: 'ISSUE_RESOLVED_BONUS' });
      expect(tx.points).toBe(5);
      const notes = await M.Notification.countDocuments({ user: ids.bob, type: 'issue' });
      expect(notes).toBeGreaterThan(0);
    });
  });

  describe('Reservations + anti-ghosting', () => {
    test('booking, overlap rejection, check-in/out', async () => {
      let res = await api().post('/api/resources').set(auth('admin')).send({ name: 'Study Room 1', category: 'Study Room', kind: 'facility' });
      ids.room = res.body.resource._id;
      const start = new Date(Date.now() + 5 * 60000);
      const end = new Date(start.getTime() + 3600000);
      res = await api().post('/api/reservations').set(auth('alice')).send({ resourceId: ids.room, startTime: start, endTime: end });
      expect(res.status).toBe(201);
      ids.resv = res.body.reservation._id;
      res = await api().post('/api/reservations').set(auth('bob')).send({ resourceId: ids.room, startTime: new Date(start.getTime() + 600000), endTime: end });
      expect(res.status).toBe(409);
      res = await api().post(`/api/reservations/${ids.resv}/check-in`).set(auth('alice'));
      expect(res.body.reservation.status).toBe('in_use');
      res = await api().post(`/api/reservations/${ids.resv}/check-out`).set(auth('alice'));
      expect(res.body.reservation.status).toBe('completed');
    });

    test('no-show is ghosted and penalised exactly once; low balance restricts', async () => {
      const r = await M.Reservation.create({ resource: ids.room, user: ids.bob, startTime: new Date(Date.now() - 30 * 60000), endTime: new Date(Date.now() + 30 * 60000), status: 'confirmed' });
      const before = (await karma.getWallet(ids.bob)).balance;
      await runAllSweeps();
      await runAllSweeps();
      expect((await M.Reservation.findById(r._id)).status).toBe('ghosted');
      const after = await karma.getWallet(ids.bob);
      expect(after.balance).toBe(before - 20);
      expect(after.status).toBe('penalty_applied');

      // Drain bob's wallet -> restricted -> cannot book or borrow
      await karma.adjust(ids.bob, -after.balance, 'test drain');
      expect((await karma.getWallet(ids.bob)).status).toBe('restricted');
      const start = new Date(Date.now() + 3 * 3600000);
      const res = await api().post('/api/reservations').set(auth('bob')).send({ resourceId: ids.room, startTime: start, endTime: new Date(start.getTime() + 3600000) });
      expect(res.status).toBe(403);
      // Earning back above zero reactivates
      await karma.adjust(ids.bob, 10, 'test restore');
      expect((await karma.getWallet(ids.bob)).status).toBe('active');
    });
  });

  describe('Multi-tier approval workflow', () => {
    test('restricted lab: proctor -> warden -> auto reservation', async () => {
      let res = await api().post('/api/resources').set(auth('admin')).send({ name: 'Hardware Lab', category: 'Lab', kind: 'facility', restricted: true });
      ids.lab = res.body.resource._id;
      const start = new Date(Date.now() + 26 * 3600000);
      const end = new Date(start.getTime() + 2 * 3600000);
      res = await api().post('/api/reservations').set(auth('carol')).send({ resourceId: ids.lab, startTime: start, endTime: end });
      expect(res.status).toBe(403); // must use approvals

      res = await api().post('/api/approvals').set(auth('carol')).send({ resourceId: ids.lab, startTime: start, endTime: end, reason: 'Final year project soldering work' });
      expect(res.status).toBe(201);
      const id = res.body.request._id;
      expect((await api().post(`/api/approvals/${id}/decide`).set(auth('warden')).send({ decision: 'approved' })).status).toBe(403);
      res = await api().post(`/api/approvals/${id}/decide`).set(auth('faculty')).send({ decision: 'approved', remarks: 'ok' });
      expect(res.body.request.status).toBe('pending_warden');
      res = await api().post(`/api/approvals/${id}/decide`).set(auth('warden')).send({ decision: 'approved' });
      expect(res.body.request.status).toBe('approved');
      expect(res.body.request.reservation.status).toBe('confirmed');
    });

    test('rejection at proctor stage ends the workflow', async () => {
      const start = new Date(Date.now() + 50 * 3600000);
      let res = await api().post('/api/approvals').set(auth('alice')).send({ resourceId: ids.lab, startTime: start, endTime: new Date(start.getTime() + 3600000), reason: 'Need lab for robotics club' });
      const id = res.body.request._id;
      res = await api().post(`/api/approvals/${id}/decide`).set(auth('faculty')).send({ decision: 'rejected', remarks: 'Not this week' });
      expect(res.body.request.status).toBe('rejected');
      expect((await api().post(`/api/approvals/${id}/decide`).set(auth('warden')).send({ decision: 'approved' })).status).toBe(409);
    });
  });

  describe('admin + karma rules', () => {
    test('analytics and rule tuning', async () => {
      let res = await api().get('/api/admin/analytics').set(auth('admin'));
      expect(res.status).toBe(200);
      expect(res.body.reports.duplicates).toBe(1);
      expect((await api().get('/api/admin/analytics').set(auth('alice'))).status).toBe(403);
      res = await api().get('/api/karma/rules').set(auth('alice'));
      const ghost = res.body.rules.find((r) => r.code === 'GHOST_RESERVATION');
      res = await api().put(`/api/karma/rules/${ghost._id}`).set(auth('admin')).send({ points: 30, gracePeriod: 15 });
      expect(res.body.rule.points).toBe(30);
      res = await api().get('/api/karma/leaderboard').set(auth('bob'));
      expect(res.body.leaderboard.length).toBe(3);
    });
  });

  describe('profiles', () => {
    test('own profile shows private data and activity stats', async () => {
      const res = await api().get('/api/users/me/profile').set(auth('alice'));
      expect(res.status).toBe(200);
      expect(res.body.isSelf).toBe(true);
      expect(res.body.profile.email).toBe('alice@vitstudent.ac.in');
      expect(res.body.wallet).not.toBeNull();
      expect(res.body.stats.itemsListed).toBe(1);
      expect(res.body.stats.timesLent).toBe(1);
      expect(res.body.stats.ticketsOpened).toBe(1);
      expect(res.body.stats.bookingsCompleted).toBe(1);
      expect(res.body.items).toHaveLength(1);
    });

    test("another student's profile is public but hides private fields", async () => {
      const res = await api().get(`/api/users/${ids.bob}/profile`).set(auth('alice'));
      expect(res.status).toBe(200);
      expect(res.body.isSelf).toBe(false);
      expect(res.body.profile.email).toBeUndefined();
      expect(res.body.wallet).toBeNull();
      expect(res.body.trust.ratingCount).toBe(1);
      expect(res.body.trust.averageRating).toBe(5);
      expect(res.body.stats.bookingsGhosted).toBe(1);
    });

    test('admin can see private fields of any user', async () => {
      const res = await api().get(`/api/users/${ids.bob}/profile`).set(auth('admin'));
      expect(res.body.profile.email).toBe('bob@vitstudent.ac.in');
      expect(res.body.wallet).not.toBeNull();
    });

    test('profile edits are validated; email and role cannot be changed', async () => {
      let res = await api().patch('/api/auth/me').set(auth('carol')).send({ name: 'Carol D', year: 3, email: 'x@vitstudent.ac.in', role: 'admin' });
      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Carol D');
      expect(res.body.user.year).toBe(3);
      expect(res.body.user.email).toBe('carol@vitstudent.ac.in');
      expect(res.body.user.role).toBe('student');
      expect((await api().patch('/api/auth/me').set(auth('carol')).send({ name: '  ' })).status).toBe(400);
      expect((await api().patch('/api/auth/me').set(auth('carol')).send({ year: 9 })).status).toBe(400);
      expect((await api().patch('/api/auth/me').set(auth('carol')).send({ password: 'hijack1' })).status).toBe(400);
    });

    test('changing password requires the current password', async () => {
      let res = await api().post('/api/auth/change-password').set(auth('carol')).send({ currentPassword: 'wrong', newPassword: 'newsecret1' });
      expect(res.status).toBe(400);
      res = await api().post('/api/auth/change-password').set(auth('carol')).send({ currentPassword: 'secret12', newPassword: 'newsecret1' });
      expect(res.status).toBe(200);
      expect((await api().post('/api/auth/login').send({ email: 'carol@vitstudent.ac.in', password: 'secret12' })).status).toBe(401);
      expect((await api().post('/api/auth/login').send({ email: 'carol@vitstudent.ac.in', password: 'newsecret1' })).status).toBe(200);
    });

    test('unknown user is 404', async () => {
      const res = await api().get('/api/users/000000000000000000000000/profile').set(auth('alice'));
      expect(res.status).toBe(404);
    });
  });
});
