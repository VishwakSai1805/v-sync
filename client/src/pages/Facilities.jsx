import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi, useNow } from '../lib/hooks';
import { countdown, fmtDateTime, fmtTime, toLocalInput } from '../lib/format';
import { Badge, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Tabs, useToast } from '../components/ui';

function nextSlot() {
  const d = new Date(Date.now() + 15 * 60000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}

function BookModal({ facility, onClose, onDone }) {
  const navigate = useNavigate();
  const start0 = nextSlot();
  const [start, setStart] = useState(toLocalInput(start0));
  const [end, setEnd] = useState(toLocalInput(start0.getTime() + 3600000));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const detail = useApi(`/resources/${facility._id}`);
  const restricted = facility.restricted;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { resourceId: facility._id, startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() };
    try {
      if (restricted) {
        await api.post('/approvals', { ...body, reason });
        onDone('Access request sent to your Faculty Proctor');
        navigate('/approvals');
      } else {
        await api.post('/reservations', { ...body, purpose: reason });
        onDone('Booked! Remember to check in on time.');
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={restricted ? `Request access: ${facility.name}` : `Book ${facility.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        {restricted && (
          <div className="rounded-lg bg-fuchsia-50 p-3 text-sm text-fuchsia-800">
            Restricted facility. Your request goes to the <b>Faculty Proctor</b>, then the <b>Hostel Warden</b>. Once both approve, the slot is booked for you automatically.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start"><input type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
          <Field label="End"><input type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} required /></Field>
        </div>
        <Field label={restricted ? 'Reason (required)' : 'Purpose (optional)'}>
          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required={restricted} minLength={restricted ? 10 : 0} placeholder={restricted ? 'e.g. Soldering for final-year project demo' : 'Group study for DBMS'} />
        </Field>
        {detail.data?.upcoming?.length > 0 && (
          <div>
            <p className="label">Already booked</p>
            <ul className="max-h-28 space-y-1 overflow-y-auto text-xs text-slate-600">
              {detail.data.upcoming.map((u) => <li key={u._id}>{fmtDateTime(u.startTime)} – {fmtTime(u.endTime)}</li>)}
            </ul>
          </div>
        )}
        <p className="text-xs text-slate-500">Max 4 hours. Check-in opens 15 min before start. No check-in within the grace period = auto-cancel + karma penalty.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy}>{restricted ? 'Submit request' : 'Confirm booking'}</Button></div>
      </form>
    </Modal>
  );
}

function NewFacilityModal({ onClose, onDone }) {
  const [form, setForm] = useState({ name: '', category: 'Study Room', location: '', description: '', capacity: 1, restricted: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/resources', { ...form, kind: 'facility' });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Add campus facility">
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox error={error} />
        <Field label="Name"><input className="input" value={form.name} onChange={set('name')} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><input className="input" value={form.category} onChange={set('category')} required /></Field>
          <Field label="Parallel slots"><input className="input" type="number" min={1} value={form.capacity} onChange={set('capacity')} /></Field>
        </div>
        <Field label="Location"><input className="input" value={form.location} onChange={set('location')} /></Field>
        <Field label="Description"><textarea className="input" rows={2} value={form.description} onChange={set('description')} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.restricted} onChange={set('restricted')} /> Restricted (requires Proctor → Warden approval)</label>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy}>Add facility</Button></div>
      </form>
    </Modal>
  );
}

function ReservationCard({ r, grace, now, onAction, showUser }) {
  const start = new Date(r.startTime).getTime();
  const deadline = start + grace * 60000;
  const opensAt = start - 15 * 60000;
  const canCheckIn = r.status === 'confirmed' && now >= opensAt && now <= deadline;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <div className="flex items-center gap-2"><p className="font-semibold">{r.resource?.name}</p><Badge value={r.status} />{r.approvalRequest && <Badge value="restricted_tag" label="Approved access" />}</div>
        <p className="text-sm text-slate-500">{fmtDateTime(r.startTime)} – {fmtTime(r.endTime)}{showUser && r.user ? ` · ${r.user.name}` : ''}</p>
        {r.status === 'confirmed' && !showUser && (
          <p className={`mt-1 font-mono text-xs ${now > start ? 'text-rose-600' : 'text-slate-500'}`}>
            {now < opensAt ? `Check-in opens in ${countdown(opensAt - now)}` : now <= deadline ? `⏱ Check in within ${countdown(deadline - now)} or lose karma` : 'Check-in window closed — will be marked ghosted'}
          </p>
        )}
      </div>
      {!showUser && (
        <div className="flex gap-2">
          {r.status === 'confirmed' && <Button size="sm" variant="success" disabled={!canCheckIn} onClick={() => onAction(r, 'check-in')}>Check in</Button>}
          {r.status === 'in_use' && <Button size="sm" onClick={() => onAction(r, 'check-out')}>Check out</Button>}
          {['requested', 'confirmed'].includes(r.status) && now < deadline && <Button size="sm" variant="ghost" onClick={() => onAction(r, 'cancel')}>Cancel</Button>}
        </div>
      )}
    </Card>
  );
}

export default function Facilities() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const isStudent = user.role === 'student';
  const [tab, setTab] = useState(isStudent ? 'browse' : 'all');
  const [booking, setBooking] = useState(null);
  const [adding, setAdding] = useState(false);
  const now = useNow(1000);

  const facilities = useApi('/resources?kind=facility');
  const mine = useApi(isStudent ? '/reservations' : null);
  const all = useApi(!isStudent ? '/reservations?scope=all' : null);

  const onAction = async (r, action) => {
    if (action === 'cancel' && !window.confirm('Cancel this booking? Cancelling close to the start time costs karma.')) return;
    try {
      const res = await api.post(`/reservations/${r._id}/${action}`);
      toast(action === 'check-in' ? 'Checked in ✓' : action === 'check-out' ? 'Checked out — thanks!' : res.penalised ? 'Cancelled (late-cancellation penalty applied)' : 'Booking cancelled', res.penalised ? 'info' : 'success');
      mine.reload();
      refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const grace = mine.data?.ghostGraceMinutes ?? 10;
  const myRes = mine.data?.reservations || [];
  const active = myRes.filter((r) => ['confirmed', 'in_use', 'requested'].includes(r.status)).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const past = myRes.filter((r) => !['confirmed', 'in_use', 'requested'].includes(r.status));

  return (
    <>
      <PageHeader
        title={isStudent ? 'Book Campus Facilities' : 'Facilities & Reservations'}
        subtitle={isStudent ? 'Study rooms, labs, laundry — check in on time to keep your karma.' : 'Campus-wide reservation activity.'}
        actions={user.role === 'admin' && <Button onClick={() => setAdding(true)}>+ Add facility</Button>}
      />
      <Tabs value={tab} onChange={setTab} tabs={isStudent
        ? [{ value: 'browse', label: 'Facilities' }, { value: 'mine', label: 'My bookings', count: active.length }, { value: 'history', label: 'History' }]
        : [{ value: 'all', label: 'All reservations' }, { value: 'browse', label: 'Facilities' }]} />

      {tab === 'browse' && (facilities.loading ? <Spinner /> : facilities.data.resources.length === 0 ? <Empty title="No facilities yet" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {facilities.data.resources.map((f) => (
            <Card key={f._id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{f.name}</h3>
                {f.restricted ? <Badge value="restricted_tag" label="Restricted" /> : <Badge value={f.availabilityStatus} />}
              </div>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-indigo-600">{f.category}</p>
              <p className="mt-1 text-sm text-slate-500">📍 {f.location || '—'}</p>
              {f.description && <p className="mt-2 text-sm text-slate-600">{f.description}</p>}
              {isStudent && (
                <Button className="mt-4" size="sm" variant={f.restricted ? 'secondary' : 'primary'} disabled={f.availabilityStatus === 'unavailable'} onClick={() => setBooking(f)}>
                  {f.restricted ? 'Request access' : 'Book a slot'}
                </Button>
              )}
            </Card>
          ))}
        </div>
      ))}

      {tab === 'mine' && (mine.loading ? <Spinner /> : active.length === 0 ? <Empty title="No upcoming bookings" action={<Button onClick={() => setTab('browse')}>Find a facility</Button>} /> : (
        <div className="space-y-3">{active.map((r) => <ReservationCard key={r._id} r={r} grace={grace} now={now} onAction={onAction} />)}</div>
      ))}

      {tab === 'history' && (mine.loading ? <Spinner /> : past.length === 0 ? <Empty title="No past bookings" /> : (
        <div className="space-y-3">{past.map((r) => <ReservationCard key={r._id} r={r} grace={grace} now={now} onAction={onAction} />)}</div>
      ))}

      {tab === 'all' && (all.loading ? <Spinner /> : all.data.reservations.length === 0 ? <Empty title="No reservations yet" /> : (
        <div className="space-y-3">{all.data.reservations.map((r) => <ReservationCard key={r._id} r={r} grace={10} now={now} showUser />)}</div>
      ))}

      {booking && <BookModal facility={booking} onClose={() => setBooking(null)} onDone={(msg) => { setBooking(null); toast(msg); mine.reload(); setTab('mine'); }} />}
      {adding && <NewFacilityModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); toast('Facility added'); facilities.reload(); }} />}
    </>
  );
}
