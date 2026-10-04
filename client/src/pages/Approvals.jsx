import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { fmtDateTime, fmtTime } from '../lib/format';
import { Badge, Button, Card, Empty, Modal, PageHeader, Spinner, Tabs, TrustPill, UserLink, useToast } from '../components/ui';

const STEPS = [['pending_proctor', 'Faculty Proctor'], ['pending_warden', 'Hostel Warden'], ['approved', 'Booked']];

function Pipeline({ r }) {
  const idx = r.status === 'approved' ? 2 : r.status === 'pending_warden' ? 1 : 0;
  const failed = ['rejected', 'cancelled'].includes(r.status);
  return (
    <div className="mt-3 flex items-center gap-2 text-xs">
      {STEPS.map(([key, label], i) => {
        const done = !failed && (i < idx || r.status === 'approved');
        const current = !failed && i === idx && r.status !== 'approved';
        const rejectedHere = r.status === 'rejected' && ((i === 0 && r.proctorDecision?.decision === 'rejected') || (i === 1 && r.wardenDecision?.decision === 'rejected'));
        return (
          <div key={key} className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 font-semibold ${rejectedHere ? 'bg-rose-100 text-rose-700' : done ? 'bg-emerald-100 text-emerald-700' : current ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-300' : 'bg-slate-100 text-slate-500'}`}>
              {rejectedHere ? '✕ ' : done ? '✓ ' : ''}{label}
            </span>
            {i < STEPS.length - 1 && <span className="text-slate-300">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function Decision({ label, d }) {
  if (!d) return null;
  return <p className="text-xs text-slate-500">{label}: <b className={d.decision === 'approved' ? 'text-emerald-700' : 'text-rose-700'}>{d.decision}</b> by {d.by?.name} · {fmtDateTime(d.at)}{d.remarks ? ` — “${d.remarks}”` : ''}</p>;
}

function DecideModal({ req, decision, onClose, onDone }) {
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/approvals/${req._id}/decide`, { decision, remarks });
      onDone();
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={decision === 'approved' ? 'Approve request' : 'Reject request'}>
      <p className="mb-3 text-sm text-slate-600">{req.student.name} → {req.resource.name}, {fmtDateTime(req.startTime)} – {fmtTime(req.endTime)}</p>
      <textarea className="input" rows={3} placeholder="Remarks (optional, visible to student)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={decision === 'approved' ? 'success' : 'danger'} loading={busy} onClick={submit}>{decision === 'approved' ? 'Approve' : 'Reject'}</Button>
      </div>
    </Modal>
  );
}

export default function Approvals() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useApi('/approvals');
  const [deciding, setDeciding] = useState(null);
  const isStudent = user.role === 'student';
  const myStage = user.role === 'faculty' ? 'pending_proctor' : user.role === 'warden' ? 'pending_warden' : null;
  const [tab, setTab] = useState('pending');

  if (loading) return <Spinner />;
  const all = data.requests;
  const pending = all.filter((r) => (user.role === 'admin' ? ['pending_proctor', 'pending_warden'].includes(r.status) : isStudent ? r.status.startsWith('pending') : r.status === myStage));
  const done = all.filter((r) => !pending.includes(r));
  const list = tab === 'pending' ? pending : done;

  const cancel = async (r) => {
    try { await api.post(`/approvals/${r._id}/cancel`); toast('Request withdrawn'); reload(); } catch (e) { toast(e.message, 'error'); }
  };

  const canDecide = (r) => user.role === 'admin' ? r.status.startsWith('pending') : r.status === myStage;

  return (
    <>
      <PageHeader
        title={isStudent ? 'Restricted Access Requests' : 'Approval Queue'}
        subtitle={isStudent ? 'Late-night / restricted facility access: Faculty Proctor → Hostel Warden.' : user.role === 'faculty' ? 'Tier 1: you review requests first; approved ones move to the Warden.' : user.role === 'warden' ? 'Tier 2: final sign-off. Approval books the slot automatically.' : 'All multi-tier approval requests.'}
        actions={isStudent && <Link to="/facilities"><Button>+ New request</Button></Link>}
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'pending', label: isStudent ? 'In progress' : 'Awaiting decision', count: pending.length }, { value: 'done', label: 'History' }]} />
      {list.length === 0 ? <Empty title={tab === 'pending' ? 'Nothing pending' : 'No history yet'} hint={isStudent && tab === 'pending' ? 'Pick a restricted facility on the Book Facilities page to request access.' : undefined} /> : (
        <div className="space-y-3">
          {list.map((r) => (
            <Card key={r._id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{r.resource?.name}</p>
                    <Badge value={r.status} />
                  </div>
                  <p className="text-sm text-slate-500">{fmtDateTime(r.startTime)} – {fmtTime(r.endTime)} · 📍 {r.resource?.location}</p>
                  {!isStudent && (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <UserLink user={r.student} className="font-semibold" /> <span className="text-slate-500">{r.student?.department}{r.student?.year ? `, Y${r.student.year}` : ''}{r.student?.hostelBlock ? `, Block ${r.student.hostelBlock}` : ''}</span>
                      <TrustPill score={r.student?.trustScore ?? 50} />
                    </p>
                  )}
                  <p className="mt-1 text-sm text-slate-700">“{r.reason}”</p>
                  <Pipeline r={r} />
                  <div className="mt-2 space-y-0.5">
                    <Decision label="Proctor" d={r.proctorDecision} />
                    <Decision label="Warden" d={r.wardenDecision} />
                  </div>
                </div>
                <div className="flex gap-2">
                  {!isStudent && canDecide(r) && <>
                    <Button size="sm" variant="success" onClick={() => setDeciding({ req: r, decision: 'approved' })}>Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => setDeciding({ req: r, decision: 'rejected' })}>Reject</Button>
                  </>}
                  {isStudent && r.status.startsWith('pending') && <Button size="sm" variant="ghost" onClick={() => cancel(r)}>Withdraw</Button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {deciding && <DecideModal {...deciding} onClose={() => setDeciding(null)} onDone={() => { toast(deciding.decision === 'approved' ? 'Approved' : 'Rejected'); setDeciding(null); reload(); }} />}
    </>
  );
}
