import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { Empty, PageHeader, Spinner, Stat, Tabs } from '../components/ui';
import { IssueRow } from './Issues';

const RANK = { critical: 0, high: 1, medium: 2, low: 3 };

export default function MaintenanceTickets() {
  const { user } = useAuth();
  const [tab, setTab] = useState('active');
  const { data, loading } = useApi('/issues');
  if (loading) return <Spinner />;
  const issues = data.issues;
  const active = issues.filter((i) => ['open', 'in_progress'].includes(i.status)).sort((a, b) => RANK[a.priority] - RANK[b.priority]);
  const closed = issues.filter((i) => !['open', 'in_progress'].includes(i.status));
  return (
    <>
      <PageHeader title="My Tickets" subtitle={`${user.name} · sorted by priority (more student reports = higher priority)`} />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="To start" value={active.filter((i) => i.status === 'open').length} tone="amber" />
        <Stat label="In progress" value={active.filter((i) => i.status === 'in_progress').length} tone="indigo" />
        <Stat label="Resolved" value={closed.filter((i) => i.status === 'resolved').length} tone="emerald" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'active', label: 'Active', count: active.length }, { value: 'closed', label: 'Closed' }]} />
      {(tab === 'active' ? active : closed).length === 0 ? <Empty title="No tickets" hint="New assignments from the admin will appear here." /> : (
        <div className="space-y-3">{(tab === 'active' ? active : closed).map((i) => <IssueRow key={i._id} issue={i} />)}</div>
      )}
    </>
  );
}
