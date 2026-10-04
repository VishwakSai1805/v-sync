import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { ROLE_LABEL, timeAgo } from '../lib/format';
import { Badge } from './ui';

const I = {
  home: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zm0 14a2 2 0 012-2h13',
  calendar: 'M8 3v4M16 3v4M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
  alert: 'M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  coin: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 4v10m-3-7h4.5a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3H15',
  check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  wrench: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.8-.7-.7-2.8 2.5-2.5z',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  bell: 'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3A6 6 0 006 11v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0',
  menu: 'M4 6h16M4 12h16M4 18h16',
};
const Icon = ({ d, className = 'h-5 w-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

const NAV = {
  student: [
    ['/', 'Dashboard', I.home], ['/library', 'P2P Library', I.book], ['/facilities', 'Book Facilities', I.calendar],
    ['/issues', 'Civic Issues', I.alert], ['/karma', 'Karma Wallet', I.coin], ['/approvals', 'Access Requests', I.check],
  ],
  faculty: [['/', 'Dashboard', I.home], ['/approvals', 'Approval Queue', I.check], ['/issues', 'Civic Issues', I.alert]],
  warden: [['/', 'Dashboard', I.home], ['/approvals', 'Approval Queue', I.check], ['/facilities', 'Reservations', I.calendar], ['/issues', 'Civic Issues', I.alert]],
  maintenance: [['/', 'My Tickets', I.wrench]],
  admin: [
    ['/', 'Analytics', I.chart], ['/issues', 'Civic Issues', I.alert], ['/admin/users', 'Users', I.home], ['/admin/rules', 'Karma Rules', I.coin],
    ['/facilities', 'Facilities', I.calendar], ['/approvals', 'Approvals', I.check],
  ],
};

function Notifications() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ notifications: [], unread: 0 });
  const navigate = useNavigate();
  const load = () => api.get('/notifications').then(setData).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  const openItem = async (n) => {
    if (!n.read) await api.post(`/notifications/${n._id}/read`).catch(() => {});
    setOpen(false);
    load();
    if (n.link) navigate(n.link);
  };
  return (
    <div className="relative">
      <button onClick={() => { setOpen((o) => !o); load(); }} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Notifications">
        <Icon d={I.bell} />
        {data.unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{data.unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <span className="text-sm font-semibold">Notifications</span>
              {data.unread > 0 && <button className="text-xs font-medium text-indigo-600" onClick={() => api.post('/notifications/read-all').then(load)}>Mark all read</button>}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {data.notifications.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications</p>}
              {data.notifications.map((n) => (
                <button key={n._id} onClick={() => openItem(n)} className={`block w-full border-b border-slate-50 px-4 py-3 text-left text-sm hover:bg-slate-50 ${n.read ? 'text-slate-500' : 'bg-indigo-50/50 text-slate-800'}`}>
                  {n.message}
                  <span className="mt-0.5 block text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, wallet, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);
  const nav = NAV[user.role] || NAV.student;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <img src="/favicon.svg" alt="" className="h-8 w-8" />
        <div>
          <p className="font-bold leading-tight text-white">V-Sync</p>
          <p className="text-[11px] leading-tight text-slate-400">Smart Campus Tracker</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {nav.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <Icon d={icon} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-4">
        <p className="truncate text-sm font-semibold text-white">{user.name}</p>
        <p className="truncate text-xs text-slate-400">{ROLE_LABEL[user.role]}</p>
        <button onClick={logout} className="mt-3 text-xs font-medium text-slate-400 hover:text-white">Sign out →</button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 bg-slate-900 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-slate-900">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Menu"><Icon d={I.menu} /></button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            {wallet && (
              <NavLink to="/karma" className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">
                <span className="font-mono font-semibold text-indigo-600">{wallet.balance}</span>
                <span className="text-slate-500">karma</span>
                {wallet.status !== 'active' && <Badge value={wallet.status} />}
              </NavLink>
            )}
            <Notifications />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-6xl"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}
