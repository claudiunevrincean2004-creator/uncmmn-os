import { NextResponse } from 'next/server';

// Server-side only: posts to the #ad-creative-pipeline Slack webhook when an Ad
// Creative transitions into (or is created at) one of the pipeline statuses. The
// webhook URL is read from SLACK_ADS_WEBHOOK_URL — the same already-configured
// webhook the other ad automations use (no NEXT_PUBLIC_ prefix, so the URL never
// reaches the browser bundle).
//
// @-mentions are resolved on the client from user profiles (slack_user_id lives
// on the profile) and passed in pre-built, so this route does no DB access. A
// mention is `<@ID>` when the person's Slack ID is set, or plain text
// `@name (Slack ID not set)` otherwise so the message still posts.

// Statuses that fire a ping. Editing / Testing / Winner / Killed are intentionally
// silent (the client never sends them, but we guard here too).
const NOTIFY = new Set(['Ad Creative Needed', 'Ready for Review', 'Revisions Needed', 'Ready to Test']);

export async function POST(request: Request) {
  const webhookUrl = process.env.SLACK_ADS_WEBHOOK_URL;
  // Missing/empty webhook → skip silently, don't crash.
  if (!webhookUrl) return NextResponse.json({ skipped: true });

  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  let status = '';
  let creativeId = '';
  let itemUrl = '';
  let sourceLink = '';
  let finalLink = '';
  let editorMention = '';
  let claudiuMention = '';
  let colinMention = '';
  try {
    const b = await request.json();
    status = str(b?.status);
    creativeId = str(b?.creativeId);
    itemUrl = str(b?.itemUrl);
    sourceLink = str(b?.sourceLink);
    finalLink = str(b?.finalLink);
    editorMention = str(b?.editorMention);
    claudiuMention = str(b?.claudiuMention);
    colinMention = str(b?.colinMention);
  } catch {
    // ignore malformed body; the guard below handles the empty status
  }

  // Unknown/non-notify status → no message (guard against stray calls).
  if (!NOTIFY.has(status)) return NextResponse.json({ skipped: true });

  const name = creativeId || 'Untitled';
  const editor = editorMention || '⚠️ an editor (unassigned)';
  // Creative ID on its own line: a Slack hyperlink to the row's page when we have
  // a URL, else plain bold text.
  const idLine = `Creative ID: ${itemUrl ? `<${itemUrl}|${name}>` : `*${name}*`}`;
  // Each message is a list of blocks separated by a blank line; null blocks
  // (e.g. an absent Final link) drop out before joining.
  let blocks: (string | null)[] = [];
  switch (status) {
    case 'Ad Creative Needed':
      blocks = [
        `🟠 New ad creative needed, ${editor}!`,
        [idLine, `Source link: ${sourceLink}`].join('\n'),
      ];
      break;
    case 'Ready for Review':
      // Single combined review gate — ping both reviewers in one message. The
      // link is the Ad Creative's OWN Final cut; omit the line when it's empty.
      blocks = [
        `🟡 New ad creative ready for review, ${`${claudiuMention} ${colinMention}`.trim()}!`,
        [idLine, finalLink ? `Take a peek: ${finalLink}` : null].filter((l): l is string => l !== null).join('\n'),
      ];
      break;
    case 'Revisions Needed':
      blocks = [
        `🔴 Revisions needed, ${editor}.`,
        [
          idLine,
          'Check comments for the revisions.',
          finalLink ? `Find the final product here: ${finalLink}` : null,
        ].filter((l): l is string => l !== null).join('\n'),
      ];
      break;
    case 'Ready to Test':
      blocks = [
        `🟢 Ad creative approved, ready to test — ${colinMention}!`,
        [idLine, finalLink ? `Find the final product here: ${finalLink}` : null].filter((l): l is string => l !== null).join('\n'),
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
