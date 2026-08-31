'use client';
import { useMemo } from 'react';
import { FinancePerson, FinancePayment, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { formatUSD } from '@/lib/utils';
import { currentMonthPrefix } from '@/lib/finance';
import Icon, { type IconName } from '@/components/Icon';
import PaymentsTable from './finance/PaymentsTable';
import PeopleManager from './finance/PeopleManager';

// ============================================================================
// Finance — ADMIN ONLY.
//
// Gated exactly like the Clippers tab, through the one existing mechanism:
//   1. lib/auth-config.ts — 'finance' is absent from EDITOR_ALLOWED, so
//      canAccess() returns false for editors and clippers.
//   2. components/Sidebar.tsx — the nav list is filtered through canAccess, so
//      the entry is never rendered for them.
//   3. app/page.tsx — the tab is mounted behind `role === 'admin'`, and the
//      existing editor bounce sends anyone who reaches it by URL/persisted state
//      back to Studio.
//   4. supabase/finance.sql — RLS on both tables is `public.is_admin()`, NOT
//      `to authenticated`. This is stricter than the studio_* tables on purpose:
//      editors have logins, so an authenticated-wide policy would show everyone
//      everyone else's pay.
// No new role, no parallel gating path.
//
// Deliberately NOT here: any Slack notification. No notify route, no ping —
// that's a later phase.
// ============================================================================

type SubTab = 'payments' | 'people';

const SUBTABS: { key: SubTab; label: string }[] = [
  { key: 'payments', label: 'Payments' },
  { key: 'people', label: 'People' },
];

// Same card shape the Studio tabs use, except the value is a preformatted
// string — these are money figures, not counts.
interface StatCard { label: string; value: string; color: string; icon: IconName; hint: string; money?: boolean }

interface Props {
  people: FinancePerson[];
  payments: FinancePayment[];
  /** OS logins, for the optional finance_people.profile_id link. */
  profiles: Profile[];
  onReload: () => void;
}

export default function FinanceTab({ people, payments, profiles, onReload }: Props) {
  const [sub, setSub] = usePersistedState<SubTab>('finance_subtab', 'payments');

  const stats: StatCard[] = useMemo(() => {
    const month = currentMonthPrefix();
    // Everything still owed, whatever its due date — an unpaid invoice from last
    // month is no less outstanding for having aged.
    const outstanding = payments
      .filter(p => p.status !== 'paid')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    // Paid this month is dated by paid_date, so back-dating a payment lands it in
    // the month the money actually moved.
    const paidThisMonth = payments
      .filter(p => p.status === 'paid' && (p.paid_date || '').slice(0, 7) === month)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const awaiting = payments.filter(p => p.status === 'ready_to_pay').length;
    return [
      { label: 'Outstanding', value: formatUSD(outstanding), color: '#f59e0b', icon: 'coins', hint: 'Every payment not yet marked Paid', money: true },
      { label: 'Paid This Month', value: formatUSD(paidThisMonth), color: '#10b981', icon: 'check', hint: 'Paid, dated in the current month', money: true },
      { label: 'Awaiting Action', value: String(awaiting), color: '#eab308', icon: 'clock', hint: 'Payments sitting at Ready to Pay' },
    ];
  }, [payments]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Summary row — same markup and tokens as the Studio stat cards, so the
          card's colour rides down as --stat-color and tints the icon tile in
          both aurora and midnight without a second copy. */}
      <div className="studio-stats">
        {stats.map(item => (
          <div key={item.label} className="studio-stat" style={{ '--stat-color': item.color } as React.CSSProperties} title={item.hint}>
            <span className="studio-stat-icon"><Icon name={item.icon} size={19} /></span>
            <div className="studio-stat-body">
              <div className="studio-stat-label">{item.label}</div>
              <div className={item.money ? 'studio-stat-num is-money' : 'studio-stat-num'} title={item.value}>{item.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="subtab-row">
        {SUBTABS.map(t => (
          <button key={t.key} className={`subtab-underline${sub === t.key ? ' active' : ''}`} onClick={() => setSub(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'payments' && (
        <PaymentsTable
          payments={payments}
          people={people}
          onManagePeople={() => setSub('people')}
          onReload={onReload}
        />
      )}
      {sub === 'people' && (
        <PeopleManager
          people={people}
          payments={payments}
          profiles={profiles}
          onReload={onReload}
        />
      )}
    </div>
  );
}
