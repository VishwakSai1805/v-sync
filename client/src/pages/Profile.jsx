import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, imageUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { fmtDate, ROLE_LABEL, titleCase } from '../lib/format';
import { Avatar, Badge, Button, Card, Empty, ErrorBox, Field, PageHeader, Spinner, Stat, TrustPill, useToast } from '../components/ui';

function IdentityCard({ profile }) {
  const meta = [
    profile.studentId && `Reg. no. ${profile.studentId}`,
    profile.department,
    profile.year && `Year ${profile.year}`,
    profile.hostelBlock && `Hostel block ${profile.hostelBlock}`,
    profile.facultyId && `Faculty ID ${profile.facultyId}`,
    profile.staffId && `Staff ID ${profile.staffId}`,
  ].filter(Boolean);
  return (
    <Card className="flex flex-wrap items-center gap-5 p-6">
      <Avatar user={profile} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold text-slate-900">{profile.name}</h2>
          <Badge value="confirmed" label={ROLE_LABEL[profile.role]} />
        </div>
        {profile.email && <p className="mt-0.5 text-sm text-slate-500">{profile.email}</p>}
        {meta.length > 0 && <p className="mt-1 text-sm text-slate-600">{meta.join(' · ')}</p>}
        <p className="mt-1 text-xs text-slate-400">Member since {fmtDate(profile.memberSince)}</p>
      </div>
    </Card>
  );
}

function TrustPanel({ trust }) {
  if (!trust) return null;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Trust &amp; Rating</h3>
        <TrustPill score={trust.trustScore} />
      </div>
      <div className="mt-4 h-2.5 rounded-full bg-slate-100">
        <div className={`h-2.5 rounded-full ${trust.trustScore >= 70 ? 'bg-emerald-500' : trust.trustScore >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${trust.trustScore}%` }} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
        <div><dt className="text-xs text-slate-500">Avg rating</dt><dd className="font-mono font-semibold">{trust.averageRating ? `${trust.averageRating}★` : '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">Ratings</dt><dd className="font-mono font-semibold">{trust.ratingCount}</dd></div>
        <div><dt className="text-xs text-slate-500">On-time returns</dt><dd className="font-mono font-semibold">{trust.onTimeRatePct === null ? '—' : `${trust.onTimeRatePct}%`}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-slate-500">70% average lender rating + 30% on-time return rate, smoothed so new users start at 50.</p>
    </Card>
  );
}

function StudentStats({ stats, wallet }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {wallet && <Stat label="Karma" value={wallet.balance} tone={wallet.balance > 0 ? 'indigo' : 'rose'} hint={<Badge value={wallet.status} />} />}
      <Stat label="Items listed" value={stats.itemsListed} hint={`${stats.activeLending} currently lent out`} />
      <Stat label="Times lent" value={stats.timesLent} tone="emerald" hint="completed loans" />
      <Stat label="Times borrowed" value={stats.timesBorrowed} hint={`${stats.activeBorrowing} active`} />
      <Stat label="Issues reported" value={stats.issuesReported} tone="amber" hint={`${stats.ticketsOpened} new ticket${stats.ticketsOpened === 1 ? '' : 's'}`} />
      <Stat label="Bookings kept" value={stats.bookingsCompleted} tone="emerald" />
      <Stat label="No-shows" value={stats.bookingsGhosted} tone={stats.bookingsGhosted ? 'rose' : 'slate'} hint="ghosted bookings" />
    </div>
  );
}

function ItemsGrid({ items }) {
  if (!items.length) return <Empty title="No items listed" />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <Card key={it._id} className="flex items-center gap-3 p-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
            {it.image ? <img src={imageUrl(it.image)} alt="" className="h-full w-full object-cover" /> : '📦'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{it.name}</p>
            <p className="text-xs text-slate-500">{it.category}</p>
          </div>
          <Badge value={it.availabilityStatus} />
        </Card>
      ))}
    </div>
  );
}

function EditDetails({ profile, onSaved }) {
  const toast = useToast();
  const isStudent = profile.role === 'student';
  const [form, setForm] = useState({ name: '', department: '', studentId: '', year: '', hostelBlock: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setForm({ name: profile.name || '', department: profile.department || '', studentId: profile.studentId || '', year: profile.year || '', hostelBlock: profile.hostelBlock || '' });
  }, [profile]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { name: form.name, department: form.department };
    if (isStudent) Object.assign(body, { studentId: form.studentId, year: form.year, hostelBlock: form.hostelBlock });
    try {
      await api.patch('/auth/me', body);
      toast('Profile updated');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-5">
      <h3 className="mb-4 font-semibold">Edit details</h3>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox error={error} />
        <Field label="Full name"><input className="input" value={form.name} onChange={set('name')} required /></Field>
        <Field label="Email" hint="Tied to your institutional login; contact Admin to change it."><input className="input" value={profile.email || ''} disabled /></Field>
        <Field label="Department / programme"><input className="input" value={form.department} onChange={set('department')} /></Field>
        {isStudent && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Reg. no."><input className="input" value={form.studentId} onChange={set('studentId')} /></Field>
            <Field label="Year"><input className="input" type="number" min={1} max={6} value={form.year} onChange={set('year')} /></Field>
            <Field label="Hostel block"><input className="input" value={form.hostelBlock} onChange={set('hostelBlock')} /></Field>
          </div>
        )}
        <div className="flex justify-end"><Button loading={busy}>Save changes</Button></div>
      </form>
    </Card>
  );
}

function ChangePassword() {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) return setError('New passwords do not match');
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast('Password changed');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-5">
      <h3 className="mb-4 font-semibold">Change password</h3>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox error={error} />
        <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} required /></Field>
        <Field label="New password" hint="At least 6 characters."><input className="input" type="password" autoComplete="new-password" minLength={6} value={form.newPassword} onChange={set('newPassword')} required /></Field>
        <Field label="Confirm new password"><input className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required /></Field>
        <div className="flex justify-end"><Button loading={busy}>Update password</Button></div>
      </form>
    </Card>
  );
}

function StaffActivity({ role, staffStats }) {
  if (!staffStats) return null;
  const rows = Object.entries(staffStats);
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">{role === 'maintenance' ? 'Tickets assigned to you' : 'Your approval decisions'}</h3>
      {rows.length === 0 ? <p className="text-sm text-slate-500">No activity yet.</p> : (
        <div className="flex flex-wrap gap-2">{rows.map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><Badge value={k} /> <span className="font-mono text-sm">{v}</span></span>)}</div>
      )}
    </Card>
  );
}

function SignInMethod({ profile }) {
  return (
    <Card className="p-5">
      <h3 className="mb-2 font-semibold">Sign-in method</h3>
      <p className="flex items-center gap-2 text-sm text-slate-700">
        <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Google account <span className="text-slate-500">({profile.email})</span>
      </p>
      <p className="mt-2 text-xs text-slate-500">Your password and security are managed by your institution's Google account. V-Sync never sees your Google password.</p>
    </Card>
  );
}

export function MyProfile() {
  const { refresh } = useAuth();
  const { data, loading, error, reload } = useApi('/users/me/profile');
  if (error && !data) return <ErrorBox error={error} />;
  if (loading) return <Spinner />;
  const { profile, trust, stats, items, wallet, staffStats } = data;
  const onSaved = () => { reload(); refresh(); };
  return (
    <>
      <PageHeader title="My Profile" subtitle="Your identity, reputation and activity on V-Sync." />
      <div className="space-y-6">
        {profile.role === 'student' && !profile.studentId && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
            <b>Welcome to V-Sync!</b> Your name, email and photo came from your Google account. Add your <b>registration number, year and hostel block</b> below. Lenders and approvers see these when you request items or lab access.
          </div>
        )}
        <IdentityCard profile={profile} />
        {stats && <StudentStats stats={stats} wallet={wallet} />}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {trust && <TrustPanel trust={trust} />}
          <StaffActivity role={profile.role} staffStats={staffStats} />
          <EditDetails profile={profile} onSaved={onSaved} />
          {profile.hasPassword ? <ChangePassword /> : <SignInMethod profile={profile} />}
        </div>
        {profile.role === 'student' && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">My listed items</h3>
              <Link to="/library?tab=mine" className="text-sm font-medium text-indigo-600">Manage →</Link>
            </div>
            <ItemsGrid items={items} />
          </div>
        )}
      </div>
    </>
  );
}

export function PublicProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, loading, error } = useApi(`/users/${id}/profile`, [id]);
  if (error && !data) return <ErrorBox error={error} />;
  if (loading) return <Spinner />;
  const { profile, trust, stats, items, isSelf } = data;
  return (
    <>
      <button onClick={() => window.history.back()} className="mb-3 inline-block text-sm font-medium text-indigo-600">← Back</button>
      <PageHeader title={isSelf ? 'Your public profile' : profile.name} subtitle={isSelf ? 'This is what other students see.' : `${titleCase(profile.role)} profile`} actions={isSelf && <Link to="/profile"><Button variant="secondary">Edit profile</Button></Link>} />
      <div className="space-y-6">
        <IdentityCard profile={profile} />
        {profile.role === 'student' ? (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <TrustPanel trust={trust} />
              <Card className="p-5">
                <h3 className="mb-3 font-semibold">Community record</h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-slate-500">Times lent</dt><dd className="font-mono font-semibold">{stats.timesLent}</dd></div>
                  <div><dt className="text-xs text-slate-500">Times borrowed</dt><dd className="font-mono font-semibold">{stats.timesBorrowed}</dd></div>
                  <div><dt className="text-xs text-slate-500">Issues reported</dt><dd className="font-mono font-semibold">{stats.issuesReported}</dd></div>
                  <div><dt className="text-xs text-slate-500">Booking no-shows</dt><dd className={`font-mono font-semibold ${stats.bookingsGhosted ? 'text-rose-600' : ''}`}>{stats.bookingsGhosted}</dd></div>
                </dl>
              </Card>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">Items {isSelf ? 'you list' : `${profile.name} lends`}</h3>
                {user.role === 'student' && !isSelf && <Link to="/library" className="text-sm font-medium text-indigo-600">Browse library →</Link>}
              </div>
              <ItemsGrid items={items} />
            </div>
          </>
        ) : (
          <Empty title="Staff account" hint="Staff profiles show contact role only." />
        )}
      </div>
    </>
  );
}
