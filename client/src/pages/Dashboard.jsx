import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { fmtDateTime, ROLE_LABEL } from '../lib/format';
import { Badge, Card, Empty, PageHeader, Spinner, Stat, TrustPill, UserLink } from '../components/ui';
import { AdminAnalytics } from './Admin';
import MaintenanceTickets from './Maintenance';

function StudentDashboard() {
  const { user, wallet } = useAuth();
  const loans = useApi('/loans?status=requested,approved,borrowed,overdue');
  const resv = useApi('/reservations?status=confirmed,in_use');
  const issues = useApi('/issues?mine=true');
  if (loans.loading || resv.loading || issues.loading) return <Spinner />;
  const myLoans = loans.data.loans;
  const borrowing = myLoans.filter((l) => l.borrower._id === user._id);
  const lendingRequests = myLoans.filter((l) => l.lender._id === user._id && l.status === 'requested');
  const upcoming = [...resv.data.reservations].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const openIssues = issues.data.issues.filter((i) => ['open', 'in_progress'].includes(i.status));

  return (
    <>
      <PageHeader title={`Hi, ${user.name.split(' ')[0]} 👋`} subtitle="Here's what's happening on campus for you." />
      {!user.studentId && (
        <Link to="/profile" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 hover:bg-indigo-100">
          <span><b>Complete your profile:</b> add your registration number, year and hostel block so lenders and approvers know who you are.</span>
          <span className="shrink-0 font-semibold">Open profile →</span>
        </Link>
      )}
      {wallet?.status === 'restricted' && (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <b>Your account is restricted.</b> Your karma balance is {wallet.balance}. You can't book facilities or borrow items until it is positive again — report valid issues or lend items to earn karma.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Karma balance" value={wallet?.balance ?? '—'} tone={wallet?.balance > 0 ? 'indigo' : 'rose'} hint={<Badge value={wallet?.status || 'active'} />} />
        <Stat label="Trust score" value={user.trustScore} hint={`${user.ratingCount} ratings`} tone="emerald" />
        <Stat label="Items borrowed" value={borrowing.filter((l) => ['borrowed', 'overdue'].includes(l.status)).length} hint={`${lendingRequests.length} request(s) to review`} />
        <Stat label="My open issues" value={openIssues.length} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Upcoming bookings</h2>
            <Link to="/facilities" className="text-sm font-medium text-indigo-600">Manage →</Link>
          </div>
          {upcoming.length === 0 ? <Empty title="No upcoming bookings" action={<Link to="/facilities" className="text-sm font-medium text-indigo-600">Book a facility</Link>} /> : (
            <ul className="divide-y divide-slate-100">
              {upcoming.slice(0, 5).map((r) => (
                <li key={r._id} className="flex items-center justify-between py-2.5 text-sm">
                  <div><p className="font-medium">{r.resource?.name}</p><p className="text-slate-500">{fmtDateTime(r.startTime)}</p></div>
                  <Badge value={r.status} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">Check in within the grace period or the booking is auto-cancelled and karma is deducted.</p>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Lending activity</h2>
            <Link to="/library" className="text-sm font-medium text-indigo-600">Library →</Link>
          </div>
          {myLoans.length === 0 ? <Empty title="No active loans" hint="List an item or borrow from peers." /> : (
            <ul className="divide-y divide-slate-100">
              {myLoans.slice(0, 5).map((l) => {
                const iAmLender = l.lender._id === user._id;
                return (
                  <li key={l._id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-medium">{l.resource?.name}</p>
                      <p className="text-slate-500">{iAmLender ? <>to <UserLink user={l.borrower} /> <TrustPill score={l.borrower.trustScore} /></> : <>from <UserLink user={l.lender} /></>} · due {fmtDateTime(l.dueDate)}</p>
                    </div>
                    <Badge value={l.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function ApproverDashboard() {
  const { user } = useAuth();
  const approvals = useApi('/approvals');
  const issues = useApi('/issues?status=open,in_progress');
  if (approvals.loading || issues.loading) return <Spinner />;
  const stage = user.role === 'faculty' ? 'pending_proctor' : 'pending_warden';
  const pending = approvals.data.requests.filter((r) => r.status === stage);
  return (
    <>
      <PageHeader title={`Welcome, ${user.name}`} subtitle={ROLE_LABEL[user.role]} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Awaiting your decision" value={pending.length} tone={pending.length ? 'amber' : 'emerald'} />
        <Stat label="Decided by you" value={approvals.data.requests.length - pending.length} />
        <Stat label="Open campus issues" value={issues.data.issues.length} />
      </div>
      <Card className="mt-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Pending access requests</h2>
          <Link to="/approvals" className="text-sm font-medium text-indigo-600">Open queue →</Link>
        </div>
        {pending.length === 0 ? <Empty title="All caught up" /> : (
          <ul className="divide-y divide-slate-100">
            {pending.slice(0, 6).map((r) => (
              <li key={r._id} className="py-2.5 text-sm">
                <p className="font-medium"><UserLink user={r.student} /> → {r.resource?.name}</p>
                <p className="text-slate-500">{fmtDateTime(r.startTime)} · {r.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  if (user.role === 'admin') return <AdminAnalytics />;
  if (user.role === 'maintenance') return <MaintenanceTickets />;
  if (user.role === 'faculty' || user.role === 'warden') return <ApproverDashboard />;
  return <StudentDashboard />;
}
