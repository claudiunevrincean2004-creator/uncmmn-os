import { NextResponse } from 'next/server';
import { TEAM_SLACK_IDS, mention } from '@/lib/team-slack';

// Server-side only: posts to a Slack incoming webhook when a Story Sequence
// transitions into one of the notify statuses. The webhook URL is read from
// SLACK_STORY_WEBHOOK_URL (no NEXT_PUBLIC_ prefix) so it never reaches the
// browser bundle.

// Opener line per status. "Approved" / "Revision Requested" weave in the
// sequence name; "Ready for Review" is a fixed line. Fixed-seat people are real
// <@ID> mentions from TEAM_SLACK_IDS.
function opener(status: string, name: string): string | null {
  const n = name || 'this sequence';
  switch (status) {
    case 'Ready for Review':
      return `🎬 ${mention(TEAM_SLACK_IDS.nathan)}, a new story sequence is begging for your attention!`;
    case 'Approved':
      return `🟢 Green light for ${n}, ${mention(TEAM_SLACK_IDS.claudiu)}!`;
    case 'Revision Requested':
      return `🔧 Not quite there yet! Nathan wants tweaks on ${n}, ${mention(TEAM_SLACK_IDS.claudiu)}.`;
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
  let itemUrl = '';
  let finalUrl = '';
  try {
    const body = await request.json();
    status = typeof body?.status === 'string' ? body.status.trim() : '';
    name = typeof body?.name === 'string' ? body.name.trim() : '';
    itemUrl = typeof body?.itemUrl === 'string' ? body.itemUrl.trim() : '';
    finalUrl = typeof body?.finalUrl === 'string' ? body.finalUrl.trim() : '';
  } catch {
    // ignore malformed body; fall back to defaults below
  }

  const head = opener(status, name);
  if (!head) return NextResponse.json({ skipped: true });

  // "Revision Requested" frames the link as "Take a peek:"; the other statuses
  // keep the "Find the final products here:" wording.
  const linkLabel = status === 'Revision Requested' ? 'Take a peek' : 'Find the final products here';
  // Blocks separated by a blank line; the "Open in OS" deep link drops out when
  // no per-item URL is available.
  const blocks = [
    head,
    itemUrl ? `<${itemUrl}|🔗 Open in OS>` : null,
    finalUrl ? `${linkLabel}: ${finalUrl}` : '⚠️ No final product link added tho!',
  ].filter((b): b is string => b !== null);

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: blocks.join('\n\n') }),
    });
  } catch {
    // Never let a Slack delivery failure surface to the user / crash the request.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  return NextResponse.json({ ok: true });
}
