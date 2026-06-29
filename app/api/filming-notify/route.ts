import { NextResponse } from 'next/server';

// Server-side only: posts to a Slack incoming webhook when a Filming Session is
// marked "Filmed". The webhook URL is read from SLACK_FILMING_WEBHOOK_URL (no
// NEXT_PUBLIC_ prefix) so it never reaches the browser bundle.

// Time-based opener, chosen by the current hour in Central European Time
// (Europe/Berlin) regardless of the server's own timezone. Name is hardcoded.
function timeOpener(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      hourCycle: 'h23', // guarantees 00–23 (avoids the "24" midnight quirk)
    }).format(new Date()),
  );
  if (hour >= 5 && hour < 12) return 'Morning, Claudiu! ☕';
  if (hour >= 12 && hour < 17) return 'Midday drop, Claudiu!';
  if (hour >= 17 && hour < 22) return 'Winding down? Not yet, Claudiu —';
  return "Night shift, Claudiu — Nathan doesn't sleep apparently."; // 22:00–4:59
}

export async function POST(request: Request) {
  const webhookUrl = process.env.SLACK_FILMING_WEBHOOK_URL;
  // Missing/empty webhook → skip silently, don't crash.
  if (!webhookUrl) return NextResponse.json({ skipped: true });

  let type = '';
  let footageLink = '';
  try {
    const body = await request.json();
    // The client also sends id and name/description; the locked message format
    // only uses type + footage link, but we accept the full payload.
    type = typeof body?.type === 'string' ? body.type.trim() : '';
    footageLink = typeof body?.footageLink === 'string' ? body.footageLink.trim() : '';
  } catch {
    // ignore malformed body; fall back to defaults below
  }

  const lines = [
    timeOpener(),
    '',
    `Nathan just filmed a new ${type || 'video'}.`,
    footageLink ? `Find the RAW files here: ${footageLink}` : '⚠️ No footage link added yet.',
  ];

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: lines.join('\n') }),
    });
  } catch {
    // Never let a Slack delivery failure surface to the user / crash the request.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  return NextResponse.json({ ok: true });
}
