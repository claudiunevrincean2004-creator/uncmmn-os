import { NextResponse } from 'next/server';

// Server-side only: posts to the #main-ig-updates Slack webhook when a Video
// Review row transitions into one of the notify statuses. The webhook URL is read
// from SLACK_MAINIGUPDATES_WEBHOOK_URL (no NEXT_PUBLIC_ prefix) so it never
// reaches the browser bundle.
//
// @-mentions are resolved on the client from user profiles (slack_user_id lives
// on the profile) and passed in pre-built, so this route does no DB access. A
// mention is `<@ID>` when the person's Slack ID is set, or plain text
// `@name (Slack ID not set)` otherwise so the message still posts.

// Statuses that fire a ping. Briefing / Editing / Ready to Post / Posted are
// intentionally silent (the client never sends them, but we guard here too).
const NOTIFY = new Set(['Ready to Edit', 'In Review', 'Revisions Needed']);

export async function POST(request: Request) {
  const webhookUrl = process.env.SLACK_MAINIGUPDATES_WEBHOOK_URL;
  // Missing/empty webhook → skip silently, don't crash.
  if (!webhookUrl) return NextResponse.json({ skipped: true });

  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  let status = '';
  let title = '';
  let briefLink = '';
  let rawFilesLink = '';
  let finalLink = '';
  let editorMention = '';
  let claudiuMention = '';
  try {
    const b = await request.json();
    status = str(b?.status);
    title = str(b?.title);
    briefLink = str(b?.briefLink);
    rawFilesLink = str(b?.rawFilesLink);
    finalLink = str(b?.finalLink);
    editorMention = str(b?.editorMention);
    claudiuMention = str(b?.claudiuMention);
  } catch {
    // ignore malformed body; the guard below handles the empty status
  }

  // Unknown/non-notify status → no message (guard against stray calls).
  if (!NOTIFY.has(status)) return NextResponse.json({ skipped: true });

  const id = title || 'this video';
  const editor = editorMention || '⚠️ an editor (unassigned)';
  // Each message is a list of blocks separated by a blank line; null blocks drop
  // out before joining. Lines within a block are joined by a single newline.
  let blocks: (string | null)[] = [];
  switch (status) {
    case 'Ready to Edit': {
      const links = [
        briefLink ? `Find the clip brief here: ${briefLink}` : null,
        rawFilesLink ? `Raw files: ${rawFilesLink}` : null,
      ].filter((l): l is string => l !== null);
      blocks = [
        `🔵 New video ready to edit — *${id}*, over to you ${editor}!`,
        links.length ? links.join('\n') : null,
      ];
      break;
    }
    case 'In Review':
      blocks = [
        `🟣 *${id}* is ready for review, ${claudiuMention}!`,
        finalLink ? `Take a peek: ${finalLink}` : null,
      ];
      break;
    case 'Revisions Needed':
      blocks = [
        `🔴 Revisions needed on *${id}*, back to you ${editor}.`,
        [
          'Check the comments for what to fix.',
          finalLink ? `Find the final product here: ${finalLink}` : null,
        ].filter((l): l is string => l !== null).join('\n'),
      ];
      break;
    default:
      return NextResponse.json({ skipped: true });
  }

  const text = blocks.filter((b): b is string => b !== null).join('\n\n');

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
