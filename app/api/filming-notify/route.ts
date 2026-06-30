import { NextResponse } from 'next/server';
import { TEAM_SLACK_IDS, mention } from '@/lib/team-slack';

// Server-side only: posts to a Slack incoming webhook when a Filming Session is
// marked "Filmed". The webhook URL is read from SLACK_FILMING_WEBHOOK_URL (no
// NEXT_PUBLIC_ prefix) so it never reaches the browser bundle.

// Random opener — one of these is picked at random on each notification. Claudiu
// is a real <@ID> ping from TEAM_SLACK_IDS; "Nathan" stays as descriptive wording.
const OPENERS = [
  `Nathan's been cooking, ${mention(TEAM_SLACK_IDS.claudiu)}! 🔥`,
  `Nathan cooked again, ${mention(TEAM_SLACK_IDS.claudiu)}! 👨‍🍳`,
  `Nathan's at it again, ${mention(TEAM_SLACK_IDS.claudiu)}! 🎬`,
];

function randomOpener(): string {
  return OPENERS[Math.floor(Math.random() * OPENERS.length)];
}

export async function POST(request: Request) {
  const webhookUrl = process.env.SLACK_FILMING_WEBHOOK_URL;
  // Missing/empty webhook → skip silently, don't crash.
  if (!webhookUrl) return NextResponse.json({ skipped: true });

  let type = '';
  let itemUrl = '';
  let footageLink = '';
  try {
    const body = await request.json();
    // The client also sends id and name/description; the locked message format
    // only uses type + footage link (+ the Open in OS link), but we accept the
    // full payload.
    type = typeof body?.type === 'string' ? body.type.trim() : '';
    itemUrl = typeof body?.itemUrl === 'string' ? body.itemUrl.trim() : '';
    footageLink = typeof body?.footageLink === 'string' ? body.footageLink.trim() : '';
  } catch {
    // ignore malformed body; fall back to defaults below
  }

  // Keep the "Fresh … session" line and the footage line together (single
  // newline); the opener and the "Open in OS" deep link are their own blocks.
  const infoBlock = [
    `Fresh ${type || 'video'} session, ready just for you.`,
    footageLink ? `Find the RAW files here: ${footageLink}` : '⚠️ No footage link added tho!',
  ].join('\n');
  const blocks = [
    randomOpener(),
    itemUrl ? `<${itemUrl}|🔗 Open in OS>` : null,
    infoBlock,
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
