import { NextResponse } from 'next/server';

// Server-side only: posts to a Slack incoming webhook when an Ad Creative
// transitions into one of the notify statuses. The webhook URL is read from
// SLACK_ADS_WEBHOOK_URL (no NEXT_PUBLIC_ prefix) so it never reaches the
// browser bundle.

// Opener variants per status — one is picked at random per notification.
// Plain names, no @-mentions.
const OPENERS: Record<string, (name: string) => string[]> = {
  'Ready to test': n => [
    `🚀 Colin, a fresh ad creative is ready to test: ${n}. Let's get it live!`,
    `🎯 Yo Colin! New creative ready for testing: ${n}. Go run it!`,
  ],
  'Revision Requested': n => [
    `🔧 Heads up Claudiu — ${n} needs revisions before it's ready.`,
    `📝 Revisions needed on ${n}, Claudiu.`,
  ],
};

// "Revision Requested" frames the link as "Take a peek:"; "Ready to test" keeps
// the "Find the final products here:" wording.
const LINK_LABELS: Record<string, string> = {
  'Ready to test': 'Find the final products here',
  'Revision Requested': 'Take a peek',
};

export async function POST(request: Request) {
  const webhookUrl = process.env.SLACK_ADS_WEBHOOK_URL;
  // Missing/empty webhook → skip silently, don't crash.
  if (!webhookUrl) return NextResponse.json({ skipped: true });

  let status = '';
  let name = '';
  let finalUrl = '';
  try {
    const body = await request.json();
    status = typeof body?.status === 'string' ? body.status.trim() : '';
    name = typeof body?.name === 'string' ? body.name.trim() : '';
    finalUrl = typeof body?.finalUrl === 'string' ? body.finalUrl.trim() : '';
  } catch {
    // ignore malformed body; fall back to defaults below
  }

  const variants = OPENERS[status];
  // Unknown status → no message (the client only sends the two above, but guard
  // so a stray call can't post a malformed notification).
  if (!variants) return NextResponse.json({ skipped: true });

  const choices = variants(name || 'this creative');
  const head = choices[Math.floor(Math.random() * choices.length)];
  const linkLabel = LINK_LABELS[status];

  const lines = [
    head,
    '',
    finalUrl ? `${linkLabel}: ${finalUrl}` : '⚠️ No final product link added tho!',
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
