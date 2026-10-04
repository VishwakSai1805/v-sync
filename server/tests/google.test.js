// Google Sign-In rules. Google's token verification is mocked (it needs Google's
// servers); everything after it - domain policy, provisioning, account linking,
// feature flags - runs for real against the test database.
//   MONGO_URI_TEST=mongodb://127.0.0.1:27017/vsync_test npm test
process.env.NODE_ENV = 'test';
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_ALLOWED_DOMAINS = 'vitstudent.ac.in,vit.ac.in';
process.env.GOOGLE_STUDENT_DOMAINS = 'vitstudent.ac.in';

jest.mock('../src/services/google', () => ({ verifyGoogleIdToken: jest.fn() }));

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const M = require('../src/models');
const karma = require('../src/services/karma');
const config = require('../src/config');
const { verifyGoogleIdToken } = require('../src/services/google');
const { ApiError } = require('../src/middleware/errors');

const URI = process.env.MONGO_URI_TEST;
const d = URI ? describe : describe.skip;

// Shape of a real Google ID token payload for a Workspace account.
const googleUser = (over = {}) => ({
  sub: '1001', email: 'new.student2026@vitstudent.ac.in', email_verified: true, hd: 'vitstudent.ac.in',
  name: 'New Student', picture: 'https://lh3.googleusercontent.com/a/photo', ...over,
});

d('Google Sign-In', () => {
  const app = createApp();
  const api = () => request(app);
  const signIn = (payload) => {
    verifyGoogleIdToken.mockResolvedValueOnce(payload);
    return api().post('/api/auth/google').send({ credential: 'any.jwt.token' });
  };

  beforeAll(async () => {
    await mongoose.connect(URI);
    await mongoose.connection.dropDatabase();
    await M.User.syncIndexes();
    await karma.ensureDefaultRules();
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  afterEach(() => {
    config.passwordLoginEnabled = true;
  });

  test('config endpoint advertises the client id and sign-in options', async () => {
    const res = await api().get('/api/auth/config');
    expect(res.body.googleClientId).toBe('test-client-id.apps.googleusercontent.com');
    expect(res.body.studentDomains).toEqual(['vitstudent.ac.in']);
    expect(res.body.passwordLoginEnabled).toBe(true);
  });

  test('first sign-in with a student account creates a student with a wallet', async () => {
    const res = await signIn(googleUser());
    expect(res.status).toBe(201);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.user.role).toBe('student');
    expect(res.body.user.avatarUrl).toContain('googleusercontent');
    expect(res.body.user.googleId).toBeUndefined(); // never exposed
    expect((await karma.getWallet(res.body.user._id)).balance).toBe(100);

    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body.user.email).toBe('new.student2026@vitstudent.ac.in');
  });

  test('signing in again logs into the same account', async () => {
    const res = await signIn(googleUser({ picture: 'https://lh3.googleusercontent.com/a/new' }));
    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(false);
    expect(await M.User.countDocuments({ email: 'new.student2026@vitstudent.ac.in' })).toBe(1);
    expect(res.body.user.avatarUrl).toBe('https://lh3.googleusercontent.com/a/new');
  });

  test('personal Gmail and other domains are rejected', async () => {
    expect((await signIn(googleUser({ sub: '2', email: 'someone@gmail.com', hd: undefined }))).status).toBe(403);
    expect((await signIn(googleUser({ sub: '3', email: 'x@otheruni.edu', hd: 'otheruni.edu' }))).status).toBe(403);
  });

  test('hd claim must match the email domain (no spoofed domain)', async () => {
    const res = await signIn(googleUser({ sub: '4', email: 'x@gmail.com', hd: 'vitstudent.ac.in' }));
    expect(res.status).toBe(403);
  });

  test('unverified email is rejected', async () => {
    expect((await signIn(googleUser({ sub: '5', email: 'u@vitstudent.ac.in', email_verified: false }))).status).toBe(403);
  });

  test('staff domain cannot self-provision; admin-created staff link on first sign-in', async () => {
    let res = await signIn(googleUser({ sub: '6', email: 'prof.x@vit.ac.in', hd: 'vit.ac.in', name: 'Prof X' }));
    expect(res.status).toBe(403);
    expect(await M.User.countDocuments({ email: 'prof.x@vit.ac.in' })).toBe(0);

    // Admin provisions the proctor without a password
    await M.User.create({ name: 'Prof X', email: 'prof.x@vit.ac.in', role: 'faculty' });
    res = await signIn(googleUser({ sub: '6', email: 'prof.x@vit.ac.in', hd: 'vit.ac.in', name: 'Prof X' }));
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('faculty');
    expect((await M.User.findOne({ email: 'prof.x@vit.ac.in' })).googleId).toBe('6');
  });

  test('a different Google account cannot take over a linked email', async () => {
    const res = await signIn(googleUser({ sub: '999', email: 'prof.x@vit.ac.in', hd: 'vit.ac.in' }));
    expect(res.status).toBe(403);
  });

  test('disabled accounts cannot sign in', async () => {
    await M.User.updateOne({ email: 'prof.x@vit.ac.in' }, { isActive: false });
    expect((await signIn(googleUser({ sub: '6', email: 'prof.x@vit.ac.in', hd: 'vit.ac.in' }))).status).toBe(403);
  });

  test('invalid token from Google is rejected', async () => {
    verifyGoogleIdToken.mockRejectedValueOnce(new ApiError(401, 'Google sign-in could not be verified'));
    const res = await api().post('/api/auth/google').send({ credential: 'forged' });
    expect(res.status).toBe(401);
  });

  test('Google-only accounts cannot use password login', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'new.student2026@vitstudent.ac.in', password: 'whatever1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Google/);
  });

  test('password login can be switched off', async () => {
    await M.User.create({ name: 'Demo', email: 'demo@vitstudent.ac.in', password: 'password123', role: 'student' });
    config.passwordLoginEnabled = false;
    const res = await api().post('/api/auth/login').send({ email: 'demo@vitstudent.ac.in', password: 'password123' });
    expect(res.status).toBe(403);
    config.passwordLoginEnabled = true;
    expect((await api().post('/api/auth/login').send({ email: 'demo@vitstudent.ac.in', password: 'password123' })).status).toBe(200);
  });
});
