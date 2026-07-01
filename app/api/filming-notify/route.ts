import { NextResponse } from 'next/server';
import { TEAM_SLACK_IDS, mention } from '@/lib/team-slack';

// Server-side only: posts to a Slack incoming webhook on Filming Session status
// transitions. Two pings fire, both through this route and the same webhook URL
// (SLACK_FILMING_WEBHOOK_URL, no NEXT_PUBLIC_ prefix, so it never reaches the
// browser bundle):
//   • "Ready to Film" → 🟡, pings Nathan with the script link
//   • "Filmed"        → 🟢, the existing "Nathan's been cooking" ping
// The status is carried on the request body; anything other than "Ready to Film"
// falls through to the Filmed message for backward compatibility.

// Random opener for the Filmed ping — one is picked at random each time. Claudiu
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

  let status = '';
  let type = '';
  let itemUrl = '';
  let footageLink = '';
  let scriptUrl = '';
  try {
    const body = await request.json();
    // The client also sends id and name/description; we accept the full payload
    // but only use the fields each message format needs.
    status = typeof body?.status === 'string' ? body.status.trim() : '';
    type = typeof body?.type === 'string' ? body.type.trim() : '';
    itemUrl = typeof body?.itemUrl === 'string' ? body.itemUrl.trim() : '';
    footageLink = typeof body?.footageLink === 'string' ? body.footageLink.trim() : '';
    scriptUrl = typeof body?.scriptUrl === 'string' ? body.scriptUrl.trim() : '';
  } catch {
    // ignore malformed body; fall back to defaults below
  }

  let text: string;
  if (status === 'Ready to Film') {
    // 🟡 (yellow) matches the "Ready to Film" status color. Nathan is a real
    // <@ID> ping. The script line is omitted entirely when no script is set.
    const blocks = [
      `🟡 ${mention(TEAM_SLACK_IDS.nathan)} a session is ready to film!`,
      itemUrl ? `<${itemUrl}|🔗 Open in OS>` : null,
      scriptUrl ? `Find the script here: ${scriptUrl}` : null,
    ].filter((b): b is string => b !== null);
    text = blocks.join('\n\n');
  } else {
    // Filmed ping — 🟢 (green) matches the "Filmed" status color and leads the
    // message. Everything else (random opener, footage line, Open in OS) is
    // unchanged. Keep the "Fresh … session" line and the footage line together
    // (single newline); the opener and the deep link are their own blocks.
    const infoBlock = [
      `Fresh ${type || 'video'} session, ready just for you.`,
      footageLink ? `Find the RAW files here: ${footageLink}` : '⚠️ No footage link added tho!',
    ].join('\n');
    const blocks = [
      `🟢 ${randomOpener()}`,
      itemUrl ? `<${itemUrl}|🔗 Open in OS>` : null,
      infoBlock,
    ].filter((b): b is string => b !== null);
    text = blocks.join('\n\n');
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch {
    // Never let a Slack delivery failure surface to the user / crash the request.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  return NextResponse.json({ ok: true });
}
