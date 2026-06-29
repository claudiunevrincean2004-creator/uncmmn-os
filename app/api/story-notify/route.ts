import { NextResponse } from 'next/server';

// Server-side only: posts to a Slack incoming webhook when a Story Sequence
// transitions into one of the notify statuses. The webhook URL is read from
// SLACK_STORY_WEBHOOK_URL (no NEXT_PUBLIC_ prefix) so it never reaches the
// browser bundle.

// Opener line per status. "Approved" / "Revision Requested" weave in the
// sequence name; "Ready for Review" is a fixed line. Plain names, no @-mentions.
function opener(status: string, name: string): string | null {
  const n = name || 'this sequence';
  switch (status) {
    case 'Ready for Review':
      return '🎬 Nathan, a new story sequence is begging for your attention!';
    case 'Approved':
      return `🟢 Green light for ${n}, Claudiu!`;
    case 'Revision Requested':
      return `🔧 Not quite there yet! Nathan wants tweaks on ${n}, Claudiu. Take a peek.`;
    default:
      // Unknown status → no message (the client only ever sends the three above,
      // but guard so a stray call can't post a malformed notification).
      return null;
  }
}

export async function POST(request: Request) {
  const webhookUrl = process.env.SLACK_STORY_WEBHOOK_URL;
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

  const head = opener(status, name);
  if (!head) return NextResponse.json({ skipped: true });

  const lines = [
    head,
    '',
    finalUrl ? `Find the final products here: ${finalUrl}` : '⚠️ No final product link added tho!',
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
