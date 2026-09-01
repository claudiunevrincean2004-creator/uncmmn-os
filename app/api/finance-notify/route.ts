import { NextResponse } from 'next/server';

// Server-side only: posts to the private finance Slack channel when a payment
// transitions into 'ready_to_pay'. The webhook URL is read from
// SLACK_FINANCE_WEBHOOK_URL (no NEXT_PUBLIC_ prefix) so it never reaches the
// browser bundle — the same arrangement as every other notify route here.
//
// The @-mention is resolved on the CLIENT from profiles.slack_user_id and passed
// in pre-built, exactly as the video/story/filming routes do, so this route needs
// no database access and no service-role key.
//
// ── WHAT THIS MESSAGE MAY NOT CONTAIN ──────────────────────────────────────
// No bank details, no IBAN, no account numbers, and NOT finance_people.
// payment_link. Those live behind the admin-gated Finance tab and RLS, and a
// Slack channel is searchable, archived, and changes membership over time. The
// message carries a summary plus a link; the actual payment rail is something
// you go and look up. The route only ever reads the fields destructured below,
// so an extra field on the client payload cannot leak through by accident.

export async function POST(request: Request) {
  const webhookUrl = process.env.SLACK_FINANCE_WEBHOOK_URL;
  // Missing/empty webhook → skip silently, don't crash. The payment update on
  // the client has already been written by the time this is called.
  if (!webhookUrl) return NextResponse.json({ skipped: true, reason: 'no-webhook' });

  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  let status = '';
  let mention = '';
  let personName = '';
  let amount = '';
  let type = '';
  let dueDate = '';
  let description = '';
  let invoiceUrl = '';
  let osUrl = '';
  try {
    const b = await request.json();
    status = str(b?.status);
    mention = str(b?.mention);
    personName = str(b?.personName);
    amount = str(b?.amount);
    type = str(b?.type);
    dueDate = str(b?.dueDate);
    description = str(b?.description);
    invoiceUrl = str(b?.invoiceUrl);
    osUrl = str(b?.osUrl);
  } catch {
    // ignore malformed body; the guard below handles the empty status
  }

  // One status fires this route. Guard here too, so a stray call can't post.
  if (status !== 'ready_to_pay') return NextResponse.json({ skipped: true, reason: 'status' });

  // Due date is a `date` column ("2026-07-18"). Fixed to UTC so the day never
  // shifts with the server's timezone; unparseable → the line is dropped.
  const day = dueDate.slice(0, 10);
  const dueLabel = /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
      })
    : '';

  const greeting = `Hey ${mention || 'there'}, a new payment is ready to be settled!`;

  // Block Kit: a two-column field list, so the details read as a list rather
  // than one run-on line. The amount is bold — it's the scannable number.
  const fields = [
    personName ? `*Person*\n${personName}` : null,
    amount ? `*Amount*\n*${amount}*` : null,
    type ? `*Type*\n${type}` : null,
    dueLabel ? `*Due*\n${dueLabel}` : null,
  ].filter((f): f is string => f !== null);

  const blocks: Record<string, unknown>[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `💸 ${greeting}` } },
  ];
  if (fields.length) {
    blocks.push({ type: 'section', fields: fields.map(text => ({ type: 'mrkdwn', text })) });
  }
  if (description) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*For*\n${description}` } });
  }
  const tail = [
    invoiceUrl ? `<${invoiceUrl}|📄 Invoice>` : null,
    osUrl ? `<${osUrl}|🔗 Open the Finance tab>` : null,
  ].filter((l): l is string => l !== null);
  if (tail.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: tail.join('   ·   ') } });
  }
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: 'Payment details are in the OS — never in Slack.' }],
  });

  // `text` is the notification/fallback line for clients that don't render blocks.
  const text = `${greeting}${personName ? ` — ${personName}` : ''}${amount ? ` ${amount}` : ''}`;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, blocks }),
    });
    // Slack answers a bad payload with 200-but-not-"ok", or a 4xx. The caller
    // stamps notified_at only on a true success, so a failure stays re-sendable.
    if (!res.ok) {
      console.error('[finance-notify] Slack rejected the message', res.status, await res.text().catch(() => ''));
      return NextResponse.json({ ok: false, reason: 'slack-error' }, { status: 200 });
    }
  } catch (err) {
    // Never let a Slack delivery failure crash the request or reach the user as
    // a failed payment update — that write already happened.
    console.error('[finance-notify] Slack delivery failed', err);
    return NextResponse.json({ ok: false, reason: 'network' }, { status: 200 });
  }

  return NextResponse.json({ ok: true });
}
