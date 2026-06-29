import { NextResponse } from 'next/server';

// Server-side only: posts to the ad-creative-pipeline Slack webhook when a media
// buyer clicks "Iterate" on a creative (spawning a new Draft variation). The URL
// is read from SLACK_ADS_WEBHOOK_URL (no NEXT_PUBLIC_ prefix) so it never reaches
// the browser bundle. Plain names, no @-mentions.

export async function POST(request: Request) {
  const webhookUrl = process.env.SLACK_ADS_WEBHOOK_URL;
  // Missing/empty webhook → skip silently, don't crash.
  if (!webhookUrl) return NextResponse.json({ skipped: true });

  let originalName = '';
  let variationName = '';
  try {
    const body = await request.json();
    originalName = typeof body?.originalName === 'string' ? body.originalName.trim() : '';
    variationName = typeof body?.variationName === 'string' ? body.variationName.trim() : '';
  } catch {
    // ignore malformed body; fall back to defaults below
  }

  const original = originalName || 'a creative';
  const variation = variationName || 'a new variation';
  const text = `🔁 Claudiu, Colin wants a variation of ${original} — a new draft is ready for you to make: ${variation}.`;

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
