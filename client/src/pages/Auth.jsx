import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
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

// Loads Google Identity Services once and renders the official "Sign in with Google" button.
let gsiPromise = null;
function loadGsi() {
  gsiPromise ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://accounts.google.com/gsi/client';
    el.async = true;
    el.onload = resolve;
    el.onerror = () => { gsiPromise = null; reject(new Error('Could not load Google sign-in. Check your connection.')); };
    document.head.appendChild(el);
  });
  return gsiPromise;
}

function GoogleButton({ clientId, domain, onCredential, onError }) {
  const ref = useRef(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  useEffect(() => {
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => cb.current(resp.credential),
          hd: domain, // hint: show only accounts from this Workspace domain (the server enforces it)
          ux_mode: 'popup',
          auto_select: false,
        });
        window.google.accounts.id.renderButton(ref.current, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', width: 320 });
      })
      .catch((e) => onError(e.message));
    return () => { cancelled = true; };
  }, [clientId, domain, onError]);
  return <div ref={ref} className="flex min-h-[44px] justify-center" />;
}

export function Login() {
  const { login, loginWithGoogle } = useAuth();
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

  const onGoogle = async (credential) => {
    setBusy(true);
    setError('');
    try {
      const res = await loginWithGoogle(credential);
      navigate(res.isNewUser ? '/profile' : '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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
          <GoogleButton clientId={cfg.googleClientId} domain={domain} onCredential={onGoogle} onError={setError} />
          {busy && <p className="text-center text-sm text-slate-500">Signing you in…</p>}
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
