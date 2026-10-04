import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { timeAgo, titleCase } from '../lib/format';
import { Badge, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Tabs, useToast } from '../components/ui';

const CAT_ICON = { electrical: '⚡', plumbing: '🚰', network: '📶', hvac: '❄️', furniture: '🪑', cleanliness: '🧹', security: '🔒', other: '📌' };

function ReportModal({ categories, onClose, onDone }) {
  const [form, setForm] = useState({ title: '', description: '', category: 'network', building: '', room: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    if (file) fd.append('image', file);
    try {
      onDone(await api.post('/issues', fd));
    } catch (err) {
      if (err.status === 409 && err.data?.details?.issueId) onDone({ already: true, issue: { _id: err.data.details.issueId } });
      else setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Report a campus issue" wide>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox error={error} />
        <Field label="What's wrong?"><input className="input" value={form.title} onChange={set('title')} required placeholder="e.g. WiFi not working in study room" /></Field>
        <Field label="Details"><textarea className="input" rows={3} value={form.description} onChange={set('description')} placeholder="When did it start? How bad is it?" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Category">
            <select className="input" value={form.category} onChange={set('category')}>
              {categories.map((c) => <option key={c} value={c}>{CAT_ICON[c]} {titleCase(c)}</option>)}
            </select>
          </Field>
          <Field label="Building / block"><input className="input" value={form.building} onChange={set('building')} required placeholder="SJT" /></Field>
          <Field label="Room / area"><input className="input" value={form.room} onChange={set('room')} placeholder="401" /></Field>
        </div>
        <Field label="Photo (optional)"><input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files[0])} className="text-sm" /></Field>
        <p className="text-xs text-slate-500">If someone already reported the same problem here, your report is merged into their ticket and raises its priority.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy}>Submit report</Button></div>
      </form>
    </Modal>
  );
}

export function IssueRow({ issue }) {
  return (
    <Link to={`/issues/${issue._id}`}>
      <Card className="flex items-center gap-4 p-4 transition hover:border-indigo-300 hover:shadow">
        <span className="text-2xl">{CAT_ICON[issue.category] || '📌'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{issue.title}</p>
            <Badge value={issue.status} />
            <Badge value={issue.priority} label={`${titleCase(issue.priority)} priority`} />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">📍 {issue.location} · {timeAgo(issue.createdAt)}{issue.assignedTo ? ` · 🔧 ${issue.assignedTo.name}` : ''}</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-lg font-semibold text-slate-900">{issue.reportCount}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">reports</p>
        </div>
      </Card>
    </Link>
  );
}

export default function Issues() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canReport = ['student', 'faculty', 'warden'].includes(user.role);
  const [tab, setTab] = useState('active');
  const [category, setCategory] = useState('');
  const [reporting, setReporting] = useState(false);
  const meta = useApi('/issues/meta');

  const status = tab === 'active' ? 'open,in_progress' : tab === 'resolved' ? 'resolved,rejected' : tab === 'unassigned' ? 'open,in_progress' : '';
  const path = `/issues${qs({ status, category, mine: tab === 'mine' ? 'true' : '', assigned: tab === 'unassigned' ? 'none' : '' })}`;
  const issues = useApi(path, [path]);

  const onReported = (res) => {
    setReporting(false);
    refresh();
    if (res.already) toast('You already reported this — opening the ticket', 'info');
    else if (res.duplicate) toast(`Merged into an existing ticket (${res.issue.reportCount} reports now). Thanks for confirming!`, 'info');
    else toast('Issue reported — new ticket created (+karma)');
    navigate(`/issues/${res.issue._id}`);
  };

  const tabs = [{ value: 'active', label: 'Active' }];
  if (user.role === 'admin') tabs.push({ value: 'unassigned', label: 'Unassigned' });
  if (canReport) tabs.push({ value: 'mine', label: 'My reports' });
  tabs.push({ value: 'resolved', label: 'Closed' });

  return (
    <>
      <PageHeader title="Smart Civic Issue Tracker" subtitle="Crowd-sourced maintenance with automatic duplicate grouping." actions={canReport && <Button onClick={() => setReporting(true)}>+ Report issue</Button>} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Tabs value={tab} onChange={setTab} tabs={tabs} />
        <select className="input max-w-[180px]" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {(meta.data?.categories || []).map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
        </select>
      </div>
      {issues.loading ? <Spinner /> : issues.data.issues.length === 0 ? <Empty title="No issues here" hint={tab === 'active' ? 'Campus is looking good!' : undefined} /> : (
        <div className="space-y-3">{issues.data.issues.map((i) => <IssueRow key={i._id} issue={i} />)}</div>
      )}
      {reporting && meta.data && <ReportModal categories={meta.data.categories} onClose={() => setReporting(false)} onDone={onReported} />}
    </>
  );
}
