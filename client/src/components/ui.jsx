import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { titleCase } from '../lib/format';
import { setApiErrorReporter } from '../lib/hooks';

const cx = (...c) => c.filter(Boolean).join(' ');

export function Button({ variant = 'primary', size = 'md', className, loading, children, ...props }) {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100',
  };
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-base' };
  return (
    <button
      className={cx('inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50', variants[variant], sizes[size], className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }) {
  return <div className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)} {...props}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const BADGE = {
  // generic statuses
  open: 'bg-sky-100 text-sky-800', in_progress: 'bg-amber-100 text-amber-800', resolved: 'bg-emerald-100 text-emerald-800', rejected: 'bg-rose-100 text-rose-800',
  requested: 'bg-sky-100 text-sky-800', approved: 'bg-indigo-100 text-indigo-800', borrowed: 'bg-violet-100 text-violet-800', returned: 'bg-emerald-100 text-emerald-800',
  overdue: 'bg-rose-100 text-rose-800', cancelled: 'bg-slate-100 text-slate-600', confirmed: 'bg-indigo-100 text-indigo-800', in_use: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800', ghosted: 'bg-rose-100 text-rose-800',
  pending_proctor: 'bg-amber-100 text-amber-800', pending_warden: 'bg-orange-100 text-orange-800',
  available: 'bg-emerald-100 text-emerald-800', lent: 'bg-violet-100 text-violet-800', reserved: 'bg-amber-100 text-amber-800', unavailable: 'bg-slate-200 text-slate-600',
  // priority
  low: 'bg-slate-100 text-slate-600', medium: 'bg-amber-100 text-amber-800', high: 'bg-orange-100 text-orange-800', critical: 'bg-rose-600 text-white',
  // wallet
  active: 'bg-emerald-100 text-emerald-800', penalty_applied: 'bg-amber-100 text-amber-800', restricted: 'bg-rose-600 text-white',
  restricted_tag: 'bg-fuchsia-100 text-fuchsia-800',
};

export function Badge({ value, label, className }) {
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', BADGE[value] || 'bg-slate-100 text-slate-700', className)}>
      {label || titleCase(value)}
    </span>
  );
}

export function Spinner({ className }) {
  return (
    <div className={cx('flex justify-center py-10', className)}>
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
    </div>
  );
}

export function Empty({ title = 'Nothing here yet', hint, action }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>;
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div className={cx('w-full rounded-2xl bg-white shadow-xl', wide ? 'max-w-2xl' : 'max-w-md')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">✕</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cx('whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition', value === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
        >
          {t.label}
          {t.count ? <span className="ml-1.5 rounded-full bg-indigo-600 px-1.5 text-xs text-white">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'slate' }) {
  const tones = { slate: 'text-slate-900', indigo: 'text-indigo-600', emerald: 'text-emerald-600', rose: 'text-rose-600', amber: 'text-amber-600' };
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx('mt-1 font-mono text-2xl font-semibold', tones[tone])}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

export function TrustPill({ score }) {
  const tone = score >= 70 ? 'bg-emerald-100 text-emerald-800' : score >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800';
  return <span className={cx('rounded-full px-2 py-0.5 font-mono text-xs font-semibold', tone)} title="Trust score (0-100)">★ {score}</span>;
}

// Profile photo (Google account picture) with an initials fallback.
export function Avatar({ user, size = 'md', className }) {
  const [failed, setFailed] = useState(false);
  const sizes = { sm: 'h-8 w-8 text-xs rounded-lg', md: 'h-10 w-10 text-sm rounded-xl', lg: 'h-16 w-16 text-xl rounded-2xl' };
  const initials = String(user?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  if (user?.avatarUrl && !failed) {
    // Google photo URLs reject requests that carry a third-party Referer.
    return <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cx('shrink-0 object-cover', sizes[size], className)} />;
  }
  return <div className={cx('flex shrink-0 items-center justify-center bg-indigo-600 font-bold text-white', sizes[size], className)}>{initials}</div>;
}

// Student name that opens their public profile (trust history, items).
export function UserLink({ user, className }) {
  if (!user) return null;
  if (!user._id) return <span className={className}>{user.name}</span>;
  return (
    <Link to={`/users/${user._id}`} onClick={(e) => e.stopPropagation()} className={cx('font-medium text-indigo-700 hover:underline', className)}>
      {user.name}
    </Link>
  );
}

// --- toasts ---
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'success') => {
    const id = Math.random();
    setItems((x) => [...x, { id, message, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000);
  }, []);
  useEffect(() => { setApiErrorReporter((message) => push(message, 'error')); }, [push]);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={cx('rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg', t.tone === 'error' ? 'bg-rose-600' : t.tone === 'info' ? 'bg-slate-800' : 'bg-emerald-600')}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
