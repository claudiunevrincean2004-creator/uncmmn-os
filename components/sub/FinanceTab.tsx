'use client';
import { useMemo, useState } from 'react';
import { FinancePerson, FinancePayment, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { formatUSD } from '@/lib/utils';
import {
  PERIOD_OPTIONS, DEFAULT_PERIOD, type PeriodKey,
  periodRange, periodLabel, periodRangeLabel, inPeriod, isPaidIn, missingPaidDate,
} from '@/lib/finance';
import Icon, { type IconName } from '@/components/Icon';
import { ChoiceMenu } from './studio/FilterMenu';
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
interface StatCard {
  label: string; value: string; color: string; icon: IconName; hint: string; money?: boolean;
  /** A rule worth being able to look up, but not worth permanent screen space —
   *  rendered as the small ⓘ beside the label. */
  note?: string;
  /** Rows this card had to leave out because their data is incomplete. Rendered
   *  as a small amber pill under the figure that filters the table down to
   *  exactly those rows — visible and fixable, rather than silently dropped. */
  warn?: { text: string; title: string; onClick: () => void };
}

interface Props {
  people: FinancePerson[];
  payments: FinancePayment[];
  /** OS logins, for the optional finance_people.profile_id link. */
  profiles: Profile[];
  onReload: () => void;
}

export default function FinanceTab({ people, payments, profiles, onReload }: Props) {
  const [sub, setSub] = usePersistedState<SubTab>('finance_subtab', 'payments');
  const [storedPeriod, setPeriod] = usePersistedState<PeriodKey>('finance_period', DEFAULT_PERIOD);
  // A value persisted by an older build (or hand-edited) falls back rather than
  // leaving the trigger naming a period that no longer exists.
  const period = PERIOD_OPTIONS.some(o => o.key === storedPeriod) ? storedPeriod : DEFAULT_PERIOD;

  const range = useMemo(() => periodRange(period), [period]);

  // ONE scoped list feeds both the cards and the table, so a figure and the rows
  // under it can never disagree. inPeriod() files each payment under its anchor
  // date — paid_date once it's paid, due_date before that — which is what makes
  // "Paid · Last month" and "Outstanding · Last month" coherent side by side.
  const scoped = useMemo(() => payments.filter(p => inPeriod(p, range)), [payments, range]);

  // Rows marked paid that carry no paid_date. Drawn from EVERY payment, not the
  // scoped set: with no date they belong to no window, so a period-scoped count
  // would hide the exact rows this warning exists to get fixed.
  const undated = useMemo(() => payments.filter(missingPaidDate), [payments]);
  const [showUndated, setShowUndated] = useState(false);
  // Fixing the last one empties the list, which drops the table straight back to
  // the period — no stale "0 rows" view to dismiss by hand.
  const undatedOpen = showUndated && undated.length > 0;

  const stats: StatCard[] = useMemo(() => {
    const name = periodLabel(period);
    // Outstanding is a plain partition of the anchored set, unchanged.
    const outstanding = scoped
      .filter(p => p.status !== 'paid')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    // Paid is NOT. It re-asks the question strictly, against paid_date alone
    // (isPaidIn), so a row can only land in a month the money actually moved in.
    // A paid row with no paid_date fails that test in every period — including
    // All time — and is surfaced by the warning below rather than dropped.
    const paid = scoped
      .filter(p => isPaidIn(p, range))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const awaiting = scoped.filter(p => p.status === 'ready_to_pay').length;
    return [
      {
        label: `Outstanding · ${name}`, value: formatUSD(outstanding), color: '#f59e0b', icon: 'coins',
        hint: `Not yet paid, by due date — ${name}`, money: true,
        note: 'Unpaid payments with no due date always count as outstanding, in every period.',
      },
      {
        label: `Paid · ${name}`, value: formatUSD(paid), color: '#10b981', icon: 'check',
        hint: `Paid, by paid date — ${name}`, money: true,
        note: 'Counts paid_date only. A payment marked paid with no paid date is counted in no period at all.',
        warn: undated.length ? {
          text: `${undated.length} paid payment${undated.length === 1 ? '' : 's'} missing a paid date`,
          title: undatedOpen
            ? 'Showing them — click to go back to the period'
            : 'Excluded from this total. Click to list them and fill the dates in.',
          onClick: () => setShowUndated(v => !v),
        } : undefined,
      },
      { label: `Awaiting Action · ${name}`, value: String(awaiting), color: '#eab308', icon: 'clock', hint: `Sitting at Ready to Pay — ${name}` },
    ];
  }, [scoped, period, range, undated, undatedOpen]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Summary row — same markup and tokens as the Studio stat cards, so the
          card's colour rides down as --stat-color and tints the icon tile in
          both aurora and midnight without a second copy. */}
      <div className="studio-stats is-tight">
        {stats.map(item => (
          <div key={item.label} className="studio-stat" style={{ '--stat-color': item.color } as React.CSSProperties} title={item.hint}>
            <span className="studio-stat-icon"><Icon name={item.icon} size={19} /></span>
            <div className="studio-stat-body">
              <div className="studio-stat-label is-wrap">
                {item.label}
                {item.note && (
                  <span className="stat-info" title={item.note} aria-label={item.note} role="note" tabIndex={0}>ⓘ</span>
                )}
              </div>
              <div className={item.money ? 'studio-stat-num is-money' : 'studio-stat-num'} title={item.value}>{item.value}</div>
              {item.warn && (
                <button
                  type="button"
                  className={`stat-warn${undatedOpen ? ' is-on' : ''}`}
                  aria-pressed={undatedOpen}
                  title={item.warn.title}
                  onClick={item.warn.onClick}
                >
                  <span aria-hidden="true">⚠</span>
                  <span>{item.warn.text}</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Which dates these figures hang on — kept to one quiet line, because
          without it there's no telling whether "Paid · Last month" means billed
          last month or settled last month. */}
      <div style={{ fontSize: 11, color: 'var(--text-faint)', margin: '0 0 14px', lineHeight: 1.45 }}>
        <strong style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{periodRangeLabel(period)}</strong>
        {' · '}paid by payment date, outstanding by due date
      </div>

      {/* Tabs left, period picker opposite them — the picker no longer costs a
          row of its own above the cards. It wraps under the tabs on narrow
          screens (see .subtab-aside). */}
      <div className="subtab-row is-split">
        {SUBTABS.map(t => (
          <button key={t.key} className={`subtab-underline${sub === t.key ? ' active' : ''}`} onClick={() => setSub(t.key)}>
            {t.label}
          </button>
        ))}
        <div className="subtab-aside">
          <ChoiceMenu
            label="Period"
            icon="clock"
            heading="Show"
            ariaLabel="Reporting period"
            options={PERIOD_OPTIONS}
            value={period}
            onChange={k => setPeriod(k as PeriodKey)}
            defaultKey={DEFAULT_PERIOD}
            align="right"
          />
        </div>
      </div>

      {sub === 'payments' && (
        <PaymentsTable
          // Clicking the Paid card's warning swaps the period's rows for exactly
          // the undated ones, so they can be fixed where they are — and `focus`
          // tells the table to suspend its own filters while that's showing,
          // since a persisted "Status: Pending" would otherwise hide all of them.
          payments={undatedOpen ? undated : scoped}
          focus={undatedOpen ? {
            label: `${undated.length} paid payment${undated.length === 1 ? '' : 's'} missing a paid date`,
            hint: 'Not counted in any Paid total until each has a date. Set one below and it drops off this list.',
            onClear: () => setShowUndated(false),
          } : null}
          people={people}
          periodName={periodLabel(period)}
          onManagePeople={() => setSub('people')}
          onReload={onReload}
        />
      )}
      {sub === 'people' && (
        <PeopleManager
          people={people}
          // The Outstanding column follows the picker like everything else…
          payments={scoped}
          // …but the delete guard has to see EVERY payment: person_id is
          // `on delete restrict`, so offering a delete based only on the current
          // window would hand the user a button the database then refuses.
          allPayments={payments}
          periodName={periodLabel(period)}
          profiles={profiles}
          onReload={onReload}
        />
      )}
    </div>
  );
}
