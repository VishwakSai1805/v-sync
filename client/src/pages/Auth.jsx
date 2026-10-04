import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, tokenStore } from '../lib/api';
import { readGoogleCallback, startGoogleSignIn } from '../lib/googleAuth';
import { Button, ErrorBox, Field, Spinner } from '../components/ui';

function Shell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-full">
      <div className="hidden flex-1 flex-col justify-between bg-slate-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <span className="text-lg font-bold">V-Sync</span>
        </div>
        <div>
          <h2 className="max-w-md text-4xl font-bold leading-tight">One hub for campus resources and maintenance.</h2>
          <ul className="mt-8 space-y-3 text-slate-300">
            <li>📚 Lend and borrow gear with peers you can trust</li>
            <li>🛠️ Report issues once — duplicates merge automatically</li>
            <li>🪙 Earn karma for helping, lose it for ghosting bookings</li>
            <li>✅ Late-night lab access approved Proctor → Warden, fully digital</li>
          </ul>
        </div>
        <p className="text-xs text-slate-500">Software Engineering Lab · BCSE301P · Group 21</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

const DEMO = [
  ['Vishwak', 'vishwak@vitstudent.ac.in'], ['Suyash', 'suyash@vitstudent.ac.in'], ['Pratik', 'pratik@vitstudent.ac.in'],
  ['Proctor', 'proctor@vit.ac.in'], ['Warden', 'warden@vit.ac.in'], ['Maintenance', 'maint1@vit.ac.in'], ['Admin', 'admin@vit.ac.in'],
];

const GoogleLogo = () => (
  <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

function GoogleButton({ onClick, busy }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex w-full items-center justify-center gap-3 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:shadow disabled:opacity-60"
    >
      {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /> : <GoogleLogo />}
      Sign in with Google
    </button>
  );
}

// Google redirects back here: /auth/callback#id_token=...&state=...
// The fragment is captured once, as soon as this module loads, and processed by a
// single shared promise, so re-renders/remounts can never consume the token twice
// or read an already-cleared URL.
const initialHash = typeof window !== 'undefined' && window.location.pathname === '/auth/callback' ? window.location.hash : '';
let callbackResult = null;
function completeGoogleSignIn() {
  callbackResult ??= (async () => {
    window.history.replaceState(null, '', window.location.pathname); // keep the token out of history
    const credential = readGoogleCallback(initialHash);
    const data = await api.post('/auth/google', { credential });
    tokenStore.set(data.token);
    return data;
  })();
  return callbackResult;
}

export function GoogleCallback() {
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    completeGoogleSignIn()
      // Full reload so the whole app starts with the new session.
      .then((data) => window.location.replace(data.isNewUser ? '/profile' : '/'))
      .catch((err) => active && setError(err.message));
    return () => { active = false; };
  }, []);
  return (
    <Shell title={error ? 'Sign-in failed' : 'Signing you in…'} subtitle={error ? '' : 'Verifying your Google account with V-Sync.'}>
      {error ? (
        <div className="space-y-4">
          <ErrorBox error={error} />
          <Link to="/" className="inline-block text-sm font-medium text-indigo-600">← Back to sign in</Link>
        </div>
      ) : <Spinner />}
    </Shell>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => {
    api.get('/auth/config')
      .then(setCfg)
      .catch(() => setCfg({ googleClientId: null, passwordLoginEnabled: true, studentDomains: [] }));
  }, []);

  const onGoogle = () => {
    setBusy(true);
    setError('');
    startGoogleSignIn(cfg.googleClientId);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!cfg) {
    return <Shell title="Sign in" subtitle="Connecting to V-Sync… (the server may take up to a minute to wake up)"><Spinner /></Shell>;
  }

  const google = Boolean(cfg.googleClientId);
  const domain = cfg.studentDomains?.[0];
  const passwordForm = (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
      <Field label="Password"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      <Button className="w-full" variant={google ? 'secondary' : 'primary'} loading={busy}>Sign in</Button>
    </form>
  );

  return (
    <Shell title="Sign in" subtitle={google ? `Use your VIT Google account${domain ? ` (@${domain})` : ''}.` : 'Use your institutional email.'}>
      <ErrorBox error={error} />
      {google && (
        <div className="mt-4 space-y-3">
          <GoogleButton onClick={onGoogle} busy={busy} />
          <p className="text-center text-xs text-slate-500">New students get an account automatically on first sign-in. Faculty and staff accounts are set up by the campus admin.</p>
          <p className="text-center text-xs text-slate-400">By signing in you agree to the <Link to="/terms" className="underline hover:text-slate-600">Terms</Link> and <Link to="/privacy" className="underline hover:text-slate-600">Privacy Policy</Link>.</p>
        </div>
      )}

      {!google && cfg.passwordLoginEnabled && (
        <div className="mt-4">
          {passwordForm}
          <p className="mt-4 text-center text-sm text-slate-500">New student? <Link to="/register" className="font-medium text-indigo-600">Create an account</Link></p>
        </div>
      )}

      {cfg.passwordLoginEnabled && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
          <button type="button" onClick={() => setShowDemo((v) => !v)} className="flex w-full items-center justify-between text-left">
            <span className="label mb-0">Demo accounts · one per role</span>
            <span className="text-xs font-medium text-indigo-600">{showDemo || !google ? '' : 'Show'}</span>
          </button>
          {(showDemo || !google) && (
            <>
              <p className="mt-1 text-xs text-slate-500">For demonstrating every role (password: password123).</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DEMO.map(([label, em]) => (
                  <button key={em} type="button" onClick={() => { setEmail(em); setPassword('password123'); setShowDemo(true); }} className={`rounded-md px-2 py-1 text-xs font-medium ${email === em ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-indigo-100 hover:text-indigo-700'}`}>{label}</button>
                ))}
              </div>
              {google && <div className="mt-4">{passwordForm}</div>}
            </>
          )}
        </div>
      )}
    </Shell>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', studentId: '', department: '', year: '', hostelBlock: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register({ ...form, year: form.year ? Number(form.year) : undefined });
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Create student account" subtitle="You start with 100 karma.">
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox error={error} />
        <Field label="Full name"><input className="input" value={form.name} onChange={set('name')} required /></Field>
        <Field label="Institutional email"><input className="input" type="email" placeholder="you@vitstudent.ac.in" value={form.email} onChange={set('email')} required /></Field>
        <Field label="Password"><input className="input" type="password" minLength={6} value={form.password} onChange={set('password')} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reg. no."><input className="input" value={form.studentId} onChange={set('studentId')} /></Field>
          <Field label="Department"><input className="input" value={form.department} onChange={set('department')} /></Field>
          <Field label="Year"><input className="input" type="number" min={1} max={6} value={form.year} onChange={set('year')} /></Field>
          <Field label="Hostel block"><input className="input" value={form.hostelBlock} onChange={set('hostelBlock')} /></Field>
        </div>
        <Button className="w-full" loading={busy}>Create account</Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">Already registered? <Link to="/login" className="font-medium text-indigo-600">Sign in</Link></p>
    </Shell>
  );
}
