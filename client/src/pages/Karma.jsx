import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { fmtDateTime, titleCase } from '../lib/format';
import { Badge, Card, PageHeader, Spinner, Stat, Tabs } from '../components/ui';

export default function Karma() {
  const { user } = useAuth();
  const [tab, setTab] = useState('ledger');
  const wallet = useApi('/karma/wallet');
  const board = useApi('/karma/leaderboard');
  const rules = useApi('/karma/rules');
  if (wallet.loading) return <Spinner />;
  const w = wallet.data.wallet;

  return (
    <>
      <PageHeader title="Campus Karma Wallet" subtitle="Earn by helping the campus. Lose by wasting shared resources." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Balance" value={w.balance} tone={w.balance > 0 ? 'indigo' : 'rose'} />
        <Stat label="Standing" value={<Badge value={w.status} className="text-sm" />} hint={w.status === 'restricted' ? 'Booking & borrowing blocked' : w.status === 'penalty_applied' ? 'Recent penalty on record' : 'Good standing'} />
        <Stat label="Total earned" value={`+${w.totalEarned}`} tone="emerald" />
        <Stat label="Total deducted" value={w.totalDeducted ? `-${w.totalDeducted}` : '0'} tone="rose" />
      </div>

      <div className="mt-6">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'ledger', label: 'Transactions' }, { value: 'board', label: 'Leaderboard' }, { value: 'rules', label: 'How karma works' }]} />
        {tab === 'ledger' && (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Reason</th><th className="px-4 py-2.5 text-right">Points</th><th className="hidden px-4 py-2.5 text-right sm:table-cell">Balance</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {wallet.data.transactions.map((t) => (
                  <tr key={t._id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{fmtDateTime(t.timestamp)}</td>
                    <td className="px-4 py-2.5">{t.reason}<span className="ml-2 font-mono text-[10px] text-slate-400">{t.ruleCode}</span></td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold ${t.points >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{t.points >= 0 ? '+' : ''}{t.points}</td>
                    <td className="hidden px-4 py-2.5 text-right font-mono text-slate-500 sm:table-cell">{t.balanceAfter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        {tab === 'board' && (board.loading ? <Spinner /> : (
          <Card className="divide-y divide-slate-100">
            {board.data.leaderboard.map((r) => (
              <div key={r.userId} className={`flex items-center gap-4 px-4 py-3 ${r.userId === user._id ? 'bg-indigo-50' : ''}`}>
                <span className="w-8 font-mono text-lg font-bold text-slate-400">#{r.rank}</span>
                <div className="flex-1"><p className="font-medium">{r.name}{r.userId === user._id && ' (you)'}</p><p className="text-xs text-slate-500">{r.department}</p></div>
                <span className="font-mono font-semibold text-indigo-600">{r.balance}</span>
              </div>
            ))}
          </Card>
        ))}
        {tab === 'rules' && (rules.loading ? <Spinner /> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rules.data.rules.filter((r) => r.active).map((r) => (
              <Card key={r._id} className="flex items-start gap-3 p-4">
                <span className={`rounded-lg px-2 py-1 font-mono text-sm font-bold ${r.penaltyType === 'earn' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{r.penaltyType === 'earn' ? '+' : '-'}{r.points}</span>
                <div><p className="font-medium">{titleCase(r.code.toLowerCase())}</p><p className="text-sm text-slate-500">{r.description}{r.gracePeriod ? ` (grace: ${r.gracePeriod} min)` : ''}</p></div>
              </Card>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
