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
  let itemUrl = '';
  let briefLink = '';
  let rawFilesLink = '';
  let finalLink = '';
  let editorMention = '';
  let claudiuMention = '';
  try {
    const b = await request.json();
    status = str(b?.status);
    itemUrl = str(b?.itemUrl);
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

  const editor = editorMention || '⚠️ an editor (unassigned)';
  // Item identified only by a clickable deep link to its page; omit the line when
  // there's no URL (rather than showing plain text).
  const openLine = itemUrl ? `<${itemUrl}|🔗 Open in OS>` : null;
  // Helper: collapse a list of lines (dropping empties) into one block joined by
  // single newlines, or null if nothing remains.
  const block = (lines: (string | null)[]): string | null => {
    const kept = lines.filter((l): l is string => !!l);
    return kept.length ? kept.join('\n') : null;
  };
  // Logical blocks separated by a blank line (double newline); null blocks drop.
  let blocks: (string | null)[] = [];
  switch (status) {
    case 'Ready to Edit':
      blocks = [
        `🔵 New video ready to edit, ${editor}!`,
        openLine,
        block([
          briefLink ? `Clip brief: ${briefLink}` : null,
          rawFilesLink ? `Raw files: ${rawFilesLink}` : null,
        ]),
      ];
      break;
    case 'In Review':
      blocks = [
        `🟣 New video ready for review, ${claudiuMention}!`,
        openLine,
        block([finalLink ? `Take a peek: ${finalLink}` : null]),
      ];
      break;
    case 'Revisions Needed':
      blocks = [
        `🔴 Revisions needed, ${editor}.`,
        openLine,
        block([
          'Check the comments for what to fix.',
          finalLink ? `Find the final product here: ${finalLink}` : null,
        ]),
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
