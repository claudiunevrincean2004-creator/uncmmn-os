import { NextResponse } from 'next/server';

// Server-side only: posts to a Slack incoming webhook when a Filming Session is
// marked "Filmed". The webhook URL is read from SLACK_FILMING_WEBHOOK_URL (no
// NEXT_PUBLIC_ prefix) so it never reaches the browser bundle.

// Random opener — one of these is picked at random on each notification.
const OPENERS = [
  "Nathan's been cooking, Claudiu! 🔥",
  'Nathan cooked again, Claudiu! 👨‍🍳',
  "Nathan's at it again, Claudiu! 🎬",
];

function randomOpener(): string {
  return OPENERS[Math.floor(Math.random() * OPENERS.length)];
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
    randomOpener(),
    '',
    `Fresh ${type || 'video'} session, ready just for you.`,
    footageLink ? `Find the RAW files here: ${footageLink}` : '⚠️ No footage link added tho!',
  ];
  const text = lines.join('\n');

  const gifUrl =
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNnVja2s1ZTVoaG1yNGZkMnlleWhyang5bXB6MXliaGFmaXNoOXFpMyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/IHWWbqfkIhRzPq4uCP/giphy.gif';

  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: lines[0] },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: lines[2] },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: lines[3] },
    },
    {
      type: 'image',
      image_url: gifUrl,
      alt_text: 'Fresh footage',
    },
  ];

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `text` is the notification/fallback; `blocks` renders the message + GIF.
      body: JSON.stringify({ text, blocks }),
    });
  } catch {
    // Never let a Slack delivery failure surface to the user / crash the request.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  return NextResponse.json({ ok: true });
}
