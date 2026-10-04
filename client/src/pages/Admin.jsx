import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { fmtDate, ROLE_LABEL, titleCase } from '../lib/format';
import { Badge, Button, Card, ErrorBox, Field, Modal, PageHeader, Spinner, Stat, TrustPill, useToast } from '../components/ui';

function Bars({ data, colors = {} }) {
  const entries = Object.entries(data || {});
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <p className="text-sm text-slate-400">No data yet</p>;
  return (
    <div className="space-y-2">
      {entries.sort((a, b) => b[1] - a[1]).map(([k, v]) => (
        <div key={k} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 truncate text-slate-600">{titleCase(k)}</span>
          <div className="h-5 flex-1 rounded bg-slate-100">
            <div className={`h-5 rounded ${colors[k] || 'bg-indigo-500'}`} style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <span className="w-8 text-right font-mono text-slate-700">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function AdminAnalytics() {
  const toast = useToast();
  const { data, loading, reload } = useApi('/admin/analytics');
  const [busy, setBusy] = useState(false);
  if (loading) return <Spinner />;
  const a = data;
  const runSweeps = async () => {
    setBusy(true);
    try {
      const r = await api.post('/admin/run-sweeps');
      toast(`Sweep done: ${r.ghosted} ghosted, ${r.overdue} overdue, ${r.autoCompleted} auto-completed`, 'info');
      reload();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const openIssues = (a.issues.byStatus.open || 0) + (a.issues.byStatus.in_progress || 0);
  return (
    <>
      <PageHeader title="Reports & Analytics" subtitle="Campus-wide view of V-Sync activity." actions={<>
        <Link to="/issues"><Button variant="secondary">Manage issues</Button></Link>
        <Button variant="secondary" loading={busy} onClick={runSweeps} title="Runs automatically every minute">Run anti-ghosting sweep</Button>
      </>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Students" value={a.students} hint={`${a.users} users total`} />
        <Stat label="Open tickets" value={openIssues} tone="amber" hint={`${a.reports.total} reports received`} />
        <Stat label="Ticket clutter avoided" value={`${a.reports.ticketReductionPct}%`} tone="emerald" hint={`${a.reports.duplicates} duplicate reports merged`} />
        <Stat label="Ghost rate" value={`${a.reservations.ghostRatePct}%`} tone={a.reservations.ghostRatePct > 20 ? 'rose' : 'indigo'} hint="of finished bookings" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Pending approvals" value={a.pendingApprovals} />
        <Stat label="Karma in circulation" value={a.wallets.totalKarma} tone="indigo" />
        <Stat label="Restricted wallets" value={a.wallets.byStatus.restricted || 0} tone="rose" />
        <Stat label="Resources" value={(a.resources.p2p || 0) + (a.resources.facility || 0)} hint={`${a.resources.p2p || 0} P2P · ${a.resources.facility || 0} facilities`} />
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card className="p-5"><h2 className="mb-4 font-semibold">Issues by category</h2><Bars data={a.issues.byCategory} /></Card>
        <Card className="p-5"><h2 className="mb-4 font-semibold">Issues by status</h2><Bars data={a.issues.byStatus} colors={{ open: 'bg-sky-500', in_progress: 'bg-amber-500', resolved: 'bg-emerald-500', rejected: 'bg-rose-500' }} /></Card>
        <Card className="p-5"><h2 className="mb-4 font-semibold">Reservations</h2><Bars data={a.reservations.byStatus} colors={{ ghosted: 'bg-rose-500', completed: 'bg-emerald-500', cancelled: 'bg-slate-400' }} /></Card>
        <Card className="p-5"><h2 className="mb-4 font-semibold">P2P loans</h2><Bars data={a.loans.byStatus} colors={{ overdue: 'bg-rose-500', returned: 'bg-emerald-500', rejected: 'bg-slate-400' }} /></Card>
      </div>
    </>
  );
}

function NewUserModal({ onClose, onDone }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'maintenance', department: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.post('/admin/users', form); onDone(); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Create account">
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox error={error} />
        <Field label="Role">
          <select className="input" value={form.role} onChange={set('role')}>
            {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Name"><input className="input" value={form.name} onChange={set('name')} required /></Field>
        <Field label="Email"><input className="input" type="email" value={form.email} onChange={set('email')} required /></Field>
        <Field label="Temporary password"><input className="input" value={form.password} onChange={set('password')} minLength={6} required /></Field>
        <Field label="Department"><input className="input" value={form.department} onChange={set('department')} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy}>Create</Button></div>
      </form>
    </Modal>
  );
}

function AdjustModal({ user, onClose, onDone }) {
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await api.post('/karma/adjust', { userId: user._id, points: Number(points), reason }); onDone(); } catch (err) { setError(err.message); }
  };
  return (
    <Modal open onClose={onClose} title={`Adjust karma — ${user.name}`}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox error={error} />
        <p className="text-sm text-slate-500">Current balance: <b>{user.wallet?.balance}</b></p>
        <Field label="Points (negative to deduct)"><input className="input" type="number" value={points} onChange={(e) => setPoints(e.target.value)} required /></Field>
        <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. Penalty waived after appeal" /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button>Apply</Button></div>
      </form>
    </Modal>
  );
}

export function AdminUsers() {
  const toast = useToast();
  const [role, setRole] = useState('');
  const { data, loading, reload } = useApi(`/admin/users${role ? `?role=${role}` : ''}`, [role]);
  const [creating, setCreating] = useState(false);
  const [adjusting, setAdjusting] = useState(null);
  const toggle = async (u) => {
    try { await api.patch(`/admin/users/${u._id}`, { isActive: !u.isActive }); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <>
      <PageHeader title="Users" subtitle="Students self-register; staff accounts are created here." actions={<Button onClick={() => setCreating(true)}>+ Create account</Button>} />
      <select className="input mb-4 max-w-[220px]" value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="">All roles</option>
        {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {loading ? <Spinner /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Role</th><th className="px-4 py-2.5">Trust</th><th className="px-4 py-2.5">Karma</th><th className="px-4 py-2.5">Joined</th><th className="px-4 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.users.map((u) => (
                <tr key={u._id} className={u.isActive ? '' : 'opacity-50'}>
                  <td className="px-4 py-2.5"><p className="font-medium">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                  <td className="px-4 py-2.5">{ROLE_LABEL[u.role]}</td>
                  <td className="px-4 py-2.5">{u.role === 'student' ? <TrustPill score={u.trustScore} /> : '—'}</td>
                  <td className="px-4 py-2.5">{u.wallet ? <span className="flex items-center gap-2"><span className="font-mono">{u.wallet.balance}</span><Badge value={u.wallet.status} /></span> : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{fmtDate(u.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    {u.role === 'student' && <Button size="sm" variant="ghost" onClick={() => setAdjusting(u)}>Adjust karma</Button>}
                    <Button size="sm" variant="ghost" onClick={() => toggle(u)}>{u.isActive ? 'Disable' : 'Enable'}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {creating && <NewUserModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); toast('Account created'); reload(); }} />}
      {adjusting && <AdjustModal user={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); toast('Karma adjusted'); reload(); }} />}
    </>
  );
}

function RuleRow({ rule, onSaved }) {
  const toast = useToast();
  const [points, setPoints] = useState(rule.points);
  const [grace, setGrace] = useState(rule.gracePeriod);
  const [active, setActive] = useState(rule.active);
  const dirty = Number(points) !== rule.points || Number(grace) !== rule.gracePeriod || active !== rule.active;
  const save = async () => {
    try { await api.put(`/karma/rules/${rule._id}`, { points: Number(points), gracePeriod: Number(grace), active }); toast(`${rule.code} updated`); onSaved(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <tr>
      <td className="px-4 py-3"><p className="font-mono text-xs font-semibold">{rule.code}</p><p className="text-xs text-slate-500">{rule.description}</p></td>
      <td className="px-4 py-3"><Badge value={rule.penaltyType === 'earn' ? 'resolved' : 'rejected'} label={rule.penaltyType} /></td>
      <td className="px-4 py-3"><input className="input w-20" type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} /></td>
      <td className="px-4 py-3"><input className="input w-20" type="number" min={0} value={grace} onChange={(e) => setGrace(e.target.value)} /></td>
      <td className="px-4 py-3"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /></td>
      <td className="px-4 py-3"><Button size="sm" disabled={!dirty} onClick={save}>Save</Button></td>
    </tr>
  );
}

export function AdminRules() {
  const { data, loading, reload } = useApi('/karma/rules');
  return (
    <>
      <PageHeader title="Karma Economy Rules" subtitle="PENALTY_RULE table — tune points and grace periods without redeploying." />
      {loading ? <Spinner /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2.5">Rule</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Points</th><th className="px-4 py-2.5">Grace (min)</th><th className="px-4 py-2.5">Active</th><th className="px-4 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">{data.rules.map((r) => <RuleRow key={`${r._id}-${r.updatedAt}`} rule={r} onSaved={reload} />)}</tbody>
          </table>
        </Card>
      )}
    </>
  );
}
