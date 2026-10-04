import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, imageUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { fmtDateTime, titleCase } from '../lib/format';
import { Badge, Button, Card, ErrorBox, Field, PageHeader, Spinner, useToast } from '../components/ui';

function StaffActions({ issue, onChange }) {
  const { user } = useAuth();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [staffId, setStaffId] = useState(issue.assignedTo?._id || '');
  const [busy, setBusy] = useState(false);
  const staff = useApi(user.role === 'admin' ? '/admin/staff' : null);

  const act = async (fn, msg) => {
    setBusy(true);
    try {
      await fn();
      toast(msg);
      setNote('');
      onChange();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const setStatus = (status) => act(() => api.patch(`/issues/${issue._id}/status`, { status, note }), `Marked ${titleCase(status)}`);
  const closed = ['resolved', 'rejected'].includes(issue.status);
  const isAssignee = issue.assignedTo?._id === user._id;
  if (closed) return null;
  if (user.role === 'maintenance' && !isAssignee) return null;

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold">Actions</h2>
      {user.role === 'admin' && (
        <div className="mb-4 flex gap-2">
          <select className="input" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">Assign maintenance staff…</option>
            {(staff.data?.staff || []).map((s) => <option key={s._id} value={s._id}>{s.name} — {s.department} ({s.openTickets} open)</option>)}
          </select>
          <Button loading={busy} disabled={!staffId} onClick={() => act(() => api.patch(`/issues/${issue._id}/assign`, { staffId }), 'Assigned')}>Assign</Button>
        </div>
      )}
      <Field label="Note (shared with reporters)"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Router replaced, tested OK" /></Field>
      <div className="mt-3 flex flex-wrap gap-2">
        {issue.status === 'open' && <Button loading={busy} onClick={() => setStatus('in_progress')}>Start work</Button>}
        {issue.status === 'in_progress' && <Button variant="success" loading={busy} onClick={() => setStatus('resolved')}>Mark resolved</Button>}
        {issue.status === 'in_progress' && <Button variant="secondary" loading={busy} onClick={() => setStatus('open')}>Back to open</Button>}
        {user.role === 'admin' && issue.status === 'open' && <Button variant="danger" loading={busy} onClick={() => setStatus('rejected')}>Reject as invalid</Button>}
      </div>
    </Card>
  );
}

export default function IssueDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(`/issues/${id}`, [id]);
  if (error && !data) return <ErrorBox error={error} />;
  if (loading) return <Spinner />;
  const { issue, reports } = data;
  const imgs = [...new Set([issue.image, ...reports.map((r) => r.image)].filter(Boolean))];

  return (
    <>
      <Link to={user.role === 'maintenance' ? '/' : '/issues'} className="mb-3 inline-block text-sm font-medium text-indigo-600">← Back</Link>
      <PageHeader title={issue.title} subtitle={`📍 ${issue.location} · ${titleCase(issue.category)} · reported ${fmtDateTime(issue.createdAt)}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <div className="flex flex-wrap gap-2">
              <Badge value={issue.status} />
              <Badge value={issue.priority} label={`${titleCase(issue.priority)} priority`} />
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{issue.reportCount} student report{issue.reportCount > 1 ? 's' : ''}</span>
            </div>
            {issue.description && <p className="mt-3 text-slate-700">{issue.description}</p>}
            {imgs.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {imgs.map((im) => <a key={im} href={imageUrl(im)} target="_blank" rel="noreferrer"><img src={imageUrl(im)} alt="" className="h-28 w-28 rounded-lg object-cover" /></a>)}
              </div>
            )}
            {issue.resolutionNotes && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><b>Resolution:</b> {issue.resolutionNotes}</p>}
            <p className="mt-4 text-sm text-slate-500">Assigned to: <b className="text-slate-700">{issue.assignedTo ? `${issue.assignedTo.name} (${issue.assignedTo.department || 'Maintenance'})` : 'Not yet assigned'}</b></p>
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 font-semibold">Grouped reports</h2>
            <p className="mb-3 text-xs text-slate-500">The Duplicate Detection Engine merged these into this master ticket.</p>
            <ul className="divide-y divide-slate-100">
              {reports.map((r) => (
                <li key={r._id} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{r.title}</p>
                    {r.isDuplicate ? <span className="font-mono text-xs text-slate-500">match {Math.round((r.similarityScore || 0) * 100)}%</span> : <Badge value="open" label="Original" />}
                  </div>
                  <p className="text-slate-500">{r.reporter?.name} · {r.building}{r.room ? ` / ${r.room}` : ''} · {fmtDateTime(r.timestamp)}</p>
                  {r.description && <p className="mt-1 text-slate-600">{r.description}</p>}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          {['maintenance', 'admin'].includes(user.role) && <StaffActions issue={issue} onChange={reload} />}
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Timeline</h2>
            <ol className="relative space-y-4 border-l border-slate-200 pl-4">
              {issue.statusHistory.map((h, i) => (
                <li key={i} className="text-sm">
                  <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-indigo-500" />
                  <p className="font-medium">{h.note || titleCase(h.status)}</p>
                  <p className="text-xs text-slate-500">{titleCase(h.status)} · {h.by?.name || 'System'} · {fmtDateTime(h.at)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
