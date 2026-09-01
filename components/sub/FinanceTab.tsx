'use client';
import { useMemo, useState } from 'react';
import { FinancePerson, FinancePayment, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { formatUSD } from '@/lib/utils';
import { anchorDate, inPeriod, isPaidIn, missingPaidDate } from '@/lib/finance';
import { describeRange, presetRange } from '@/lib/date-range';
import Icon, { type IconName } from '@/components/Icon';
import DateRangePicker from './studio/DateRangePicker';
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
  /** Muted second line under the figure — the count behind a money total, so
   *  all three cards can lead with dollars and still say how many rows. */
  sub?: string;
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
  // The same from/to ISO pair every other date filter in the app stores, so the
  // shared picker drops straight in. Seeded to this calendar month, which is
  // what the old bespoke period key defaulted to.
  const thisMonth = presetRange('this_month');
  const [dateFrom, setDateFrom] = usePersistedState<string>('finance_from', thisMonth.from);
  const [dateTo, setDateTo] = usePersistedState<string>('finance_to', thisMonth.to);

  // null = All time, which is what inPeriod() has always taken for "no bounds".
  const range = useMemo(
    () => (dateFrom || dateTo ? { from: dateFrom, to: dateTo } : null),
    [dateFrom, dateTo],
  );
  // The window in words — "This month", "July 2026", "12 Jun – 4 Jul" — from the
  // same function the picker's own trigger uses, so a card label and the trigger
  // above it can never disagree.
  const periodName = describeRange(dateFrom, dateTo);
  // The picker's answer resolved to actual dates. "This month" on its own never
  // says which month — this line is what makes a figure checkable.
  const resolvedWindow = useMemo(() => {
    if (!range) return 'all payments on record';
    const day = (iso: string) =>
      new Date(`${iso}T00:00:00`).toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
    if (range.from && range.to) return `${day(range.from)} – ${day(range.to)}`;
    return range.from ? `${day(range.from)} onwards` : `up to ${day(range.to)}`;
  }, [range]);

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
    const name = periodName;
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
    // Same rows as before — status only, anchored on due_date by `scoped` (a
    // ready_to_pay row is not paid, so inPeriod files it under its due date).
    // Only what the card LEADS with changes: dollars, like its two neighbours.
    const awaitingRows = scoped.filter(p => p.status === 'ready_to_pay');
    const awaiting = awaitingRows.reduce((s, p) => s + (Number(p.amount) || 0), 0);
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
            ? 'Showing them — click to go back to the full list'
            : 'Excluded from this total, and hidden by every dated period. Click to switch to All time and list them.',
          onClick: () => {
            // A row with no paid_date is anchored to no month, so EVERY bounded
            // period filters it out (inPeriod → anchorDate is null → false for a
            // paid row). Warning about rows the picker cannot reach is exactly
            // what makes this read as a stale count. So the click moves the
            // period to All time first — the one window that does contain them —
            // and only then narrows to the list. Clearing the banner afterwards
            // then lands on a view the rows are actually in, instead of back on
            // a month that hides them again.
            if (!undatedOpen) { setDateFrom(''); setDateTo(''); }
            setShowUndated(v => !v);
          },
        } : undefined,
      },
      {
        label: `Awaiting Action · ${name}`, value: formatUSD(awaiting), color: '#eab308', icon: 'clock',
        hint: `Sitting at Ready to Pay, by due date — ${name}`, money: true,
        sub: `${awaitingRows.length} payment${awaitingRows.length === 1 ? '' : 's'}`,
      },
    ];
  }, [scoped, periodName, range, undated, undatedOpen, setDateFrom, setDateTo]);

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
              {item.sub && <div className="studio-stat-sub">{item.sub}</div>}
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
        <strong style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{resolvedWindow}</strong>
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
          <DateRangePicker
            size="md"
            align="right"
            label="Period"
            from={dateFrom}
            to={dateTo}
            // Both anchor columns, so the month list offers every month this tab
            // can actually file a payment under — paid rows by paid_date,
            // everything else by due_date, matching anchorDate().
            dates={payments.map(anchorDate)}
            onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
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
            hint: 'Counted in no Paid total, and hidden by every dated period — so the period is now All time. Set a date below and the row drops off this list.',
            onClear: () => setShowUndated(false),
          } : null}
          people={people}
          periodName={periodName}
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
          periodName={periodName}
          profiles={profiles}
          onReload={onReload}
        />
      )}
    </div>
  );
}
