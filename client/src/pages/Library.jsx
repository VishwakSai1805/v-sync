import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, imageUrl, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { fmtDate, fmtDateTime, toLocalInput } from '../lib/format';
import { Badge, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Tabs, TrustPill, useToast } from '../components/ui';

function ItemCard({ item, action }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex h-32 items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100">
        {item.image ? <img src={imageUrl(item.image)} alt="" className="h-full w-full object-cover" /> : <span className="text-4xl">📦</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug">{item.name}</h3>
          <Badge value={item.availabilityStatus} />
        </div>
        <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-indigo-600">{item.category}</p>
        {item.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.description}</p>}
        {item.owner && (
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">Owner: {item.owner.name} <TrustPill score={item.owner.trustScore} /></p>
        )}
        <div className="mt-auto pt-4">{action}</div>
      </div>
    </Card>
  );
}

function BorrowModal({ item, onClose, onDone }) {
  const [due, setDue] = useState(toLocalInput(Date.now() + 3 * 86400000));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/loans', { resourceId: item._id, dueDate: new Date(due).toISOString(), message });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Borrow "${item.name}"`}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <Field label="Return by"><input type="datetime-local" className="input" value={due} onChange={(e) => setDue(e.target.value)} required /></Field>
        <Field label="Message to owner (optional)"><textarea className="input" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Need it for the IoT lab on Thursday" /></Field>
        <p className="text-xs text-slate-500">The owner sees your trust score. Late returns cost karma and lower your trust.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy}>Send request</Button></div>
      </form>
    </Modal>
  );
}

function NewItemModal({ onClose, onDone }) {
  const [form, setForm] = useState({ name: '', category: '', description: '', location: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    fd.append('kind', 'p2p');
    if (file) fd.append('image', file);
    try {
      await api.post('/resources', fd);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="List an item for lending">
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox error={error} />
        <Field label="Item name"><input className="input" value={form.name} onChange={set('name')} required placeholder="e.g. Arduino Uno kit" /></Field>
        <Field label="Category"><input className="input" list="cats" value={form.category} onChange={set('category')} required placeholder="Textbook, Electronics, Drawing Tools…" /></Field>
        <datalist id="cats">{['Textbook', 'Electronics', 'Drawing Tools', 'Calculator', 'Lab Equipment', 'Sports'].map((c) => <option key={c} value={c} />)}</datalist>
        <Field label="Description"><textarea className="input" rows={2} value={form.description} onChange={set('description')} /></Field>
        <Field label="Pickup location"><input className="input" value={form.location} onChange={set('location')} placeholder="Hostel A, Room 214" /></Field>
        <Field label="Photo (optional)"><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} className="text-sm" /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy}>List item</Button></div>
      </form>
    </Modal>
  );
}

function ReturnModal({ loan, onClose, onDone }) {
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/loans/${loan._id}/return`, { rating });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Confirm return">
      <ErrorBox error={error} />
      <p className="text-sm text-slate-600">Rate how {loan.borrower.name} handled "{loan.resource?.name}". This feeds their trust score.</p>
      <div className="my-4 flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} className={`text-3xl ${n <= rating ? 'text-amber-400' : 'text-slate-300'}`}>★</button>
        ))}
      </div>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" loading={busy} onClick={submit}>Confirm return</Button></div>
    </Modal>
  );
}

function LoanRow({ loan, me, onAction }) {
  const iAmLender = loan.lender._id === me;
  const other = iAmLender ? loan.borrower : loan.lender;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2"><p className="font-semibold">{loan.resource?.name}</p><Badge value={loan.status} /></div>
        <p className="mt-0.5 text-sm text-slate-500">
          {iAmLender ? 'Borrower' : 'Lender'}: {other.name} {iAmLender && <TrustPill score={other.trustScore} />} · due {fmtDateTime(loan.dueDate)}
        </p>
        {loan.message && <p className="mt-1 text-sm italic text-slate-500">“{loan.message}”</p>}
        {loan.borrowerRating && <p className="mt-1 text-xs text-slate-500">Rated {loan.borrowerRating}/5 on {fmtDate(loan.returnDate)}</p>}
      </div>
      <div className="flex gap-2">
        {iAmLender && loan.status === 'requested' && <>
          <Button size="sm" variant="success" onClick={() => onAction(loan, 'approve')}>Approve</Button>
          <Button size="sm" variant="secondary" onClick={() => onAction(loan, 'reject')}>Decline</Button>
        </>}
        {loan.status === 'approved' && <Button size="sm" onClick={() => onAction(loan, 'handover')}>Mark handed over</Button>}
        {!iAmLender && ['requested', 'approved'].includes(loan.status) && <Button size="sm" variant="ghost" onClick={() => onAction(loan, 'cancel')}>Cancel</Button>}
        {iAmLender && ['borrowed', 'overdue'].includes(loan.status) && <Button size="sm" variant="success" onClick={() => onAction(loan, 'return')}>Confirm return</Button>}
      </div>
    </Card>
  );
}

export default function Library() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'browse';
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [borrowing, setBorrowing] = useState(null);
  const [returning, setReturning] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const items = useApi(`/resources${qs({ kind: 'p2p', q, category })}`, [q, category]);
  const mine = useApi('/resources?kind=p2p&mine=true');
  const loans = useApi('/loans');
  const cats = useApi('/resources/categories?kind=p2p');

  const others = useMemo(() => (items.data?.resources || []).filter((r) => r.owner?._id !== user._id), [items.data, user._id]);
  const lending = (loans.data?.loans || []).filter((l) => l.lender._id === user._id);
  const borrowingList = (loans.data?.loans || []).filter((l) => l.borrower._id === user._id);
  const pendingCount = lending.filter((l) => l.status === 'requested').length;

  const reloadAll = () => { items.reload(); mine.reload(); loans.reload(); refresh(); };

  const onAction = async (loan, action) => {
    if (action === 'return') return setReturning(loan);
    try {
      await api.post(`/loans/${loan._id}/${action}`);
      toast({ approve: 'Loan approved', reject: 'Request declined', handover: 'Marked as handed over', cancel: 'Request cancelled' }[action]);
      reloadAll();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const removeItem = async (id) => {
    if (!window.confirm('Remove this item from the library?')) return;
    try { await api.del(`/resources/${id}`); toast('Item removed'); mine.reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const toggleAvail = async (item) => {
    try {
      await api.patch(`/resources/${item._id}`, { availabilityStatus: item.availabilityStatus === 'available' ? 'unavailable' : 'available' });
      mine.reload();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <PageHeader title="P2P Resource Library" subtitle="Borrow academic gear from peers. Lend yours to earn karma." actions={<Button onClick={() => setShowNew(true)}>+ List an item</Button>} />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={[
        { value: 'browse', label: 'Browse' },
        { value: 'mine', label: 'My items' },
        { value: 'lending', label: 'Lending', count: pendingCount },
        { value: 'borrowing', label: 'Borrowing' },
      ]} />

      {tab === 'browse' && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <input className="input max-w-xs" placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input max-w-[200px]" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {(cats.data?.categories || []).map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {items.loading ? <Spinner /> : others.length === 0 ? <Empty title="No items found" hint="Try another search, or be the first to list something." /> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((it) => (
                <ItemCard key={it._id} item={it} action={<Button size="sm" className="w-full" disabled={it.availabilityStatus !== 'available'} onClick={() => setBorrowing(it)}>{it.availabilityStatus === 'available' ? 'Request to borrow' : 'Not available'}</Button>} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'mine' && (mine.loading ? <Spinner /> : mine.data.resources.length === 0 ? <Empty title="You haven't listed anything" action={<Button onClick={() => setShowNew(true)}>List your first item</Button>} /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mine.data.resources.map((it) => (
            <ItemCard key={it._id} item={it} action={
              <div className="flex gap-2">
                {it.availabilityStatus !== 'lent' && <Button size="sm" variant="secondary" className="flex-1" onClick={() => toggleAvail(it)}>{it.availabilityStatus === 'available' ? 'Pause' : 'Make available'}</Button>}
                {it.availabilityStatus !== 'lent' && <Button size="sm" variant="ghost" onClick={() => removeItem(it._id)}>Remove</Button>}
              </div>
            } />
          ))}
        </div>
      ))}

      {(tab === 'lending' || tab === 'borrowing') && (loans.loading ? <Spinner /> : (
        <div className="space-y-3">
          {(tab === 'lending' ? lending : borrowingList).length === 0 && <Empty title={tab === 'lending' ? 'No one has requested your items yet' : "You haven't borrowed anything"} />}
          {(tab === 'lending' ? lending : borrowingList).map((l) => <LoanRow key={l._id} loan={l} me={user._id} onAction={onAction} />)}
        </div>
      ))}

      {borrowing && <BorrowModal item={borrowing} onClose={() => setBorrowing(null)} onDone={() => { setBorrowing(null); toast('Request sent to the owner'); reloadAll(); setParams({ tab: 'borrowing' }); }} />}
      {showNew && <NewItemModal onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); toast('Item listed'); reloadAll(); setParams({ tab: 'mine' }); }} />}
      {returning && <ReturnModal loan={returning} onClose={() => setReturning(null)} onDone={() => { setReturning(null); toast('Return confirmed — you earned karma!'); reloadAll(); }} />}
    </>
  );
}
