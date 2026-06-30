import { NextResponse } from 'next/server';

// Server-side only: posts to the #ad-creative-pipeline Slack webhook when an Ad
// Creative transitions into (or is created at) one of the pipeline statuses. The
// webhook URL is read from SLACK_AD_PIPELINE_WEBHOOK_URL, falling back to
// SLACK_WEBHOOK_URL — neither has a NEXT_PUBLIC_ prefix so the URL never reaches
// the browser bundle.
//
// @-mentions are resolved on the client from user profiles (slack_user_id lives
// on the profile) and passed in pre-built, so this route does no DB access. A
// mention is `<@ID>` when the person's Slack ID is set, or plain text
// `@name (Slack ID not set)` otherwise so the message still posts.

// Statuses that fire a ping. Editing / Testing / Winner / Killed are intentionally
// silent (the client never sends them, but we guard here too).
const NOTIFY = new Set(['Ad Creative Needed', 'Ready for Review', 'Revisions Needed', 'Ready to Test']);

export async function POST(request: Request) {
  const webhookUrl = process.env.SLACK_AD_PIPELINE_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  // Missing/empty webhook → skip silently, don't crash.
  if (!webhookUrl) return NextResponse.json({ skipped: true });

  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  let status = '';
  let creativeId = '';
  let sourceLink = '';
  let buyerFeedback = '';
  let editorMention = '';
  let claudiuMention = '';
  let colinMention = '';
  try {
    const b = await request.json();
    status = str(b?.status);
    creativeId = str(b?.creativeId);
    sourceLink = str(b?.sourceLink);
    buyerFeedback = str(b?.buyerFeedback);
    editorMention = str(b?.editorMention);
    claudiuMention = str(b?.claudiuMention);
    colinMention = str(b?.colinMention);
  } catch {
    // ignore malformed body; the guard below handles the empty status
  }

  // Unknown/non-notify status → no message (guard against stray calls).
  if (!NOTIFY.has(status)) return NextResponse.json({ skipped: true });

  const id = creativeId || 'this creative';
  let text = '';
  switch (status) {
    case 'Ad Creative Needed':
      text = editorMention
        ? `🎬 New ad creative needed — *${id}*, assigned to ${editorMention}.${sourceLink ? ` ${sourceLink}` : ''}`
        : `🎬 New ad creative needed — *${id}*, ⚠️ unassigned — set an editor.${sourceLink ? ` ${sourceLink}` : ''}`;
      break;
    case 'Ready for Review':
      // Single combined review gate — ping both reviewers in one message.
      text = `${`${claudiuMention} ${colinMention}`.trim()} 👀 *${id}* is ready for review — take a look.`.trim();
      break;
    case 'Revisions Needed':
      text = `🔁 Revisions needed on *${id}* — back to ${editorMention || '⚠️ an editor (unassigned)'}.${buyerFeedback ? ` ${buyerFeedback}` : ''}`;
      break;
    case 'Ready to Test':
      text = `${colinMention} 🚀 *${id}* approved — ready to test, over to you.`.trim();
      break;
    default:
      return NextResponse.json({ skipped: true });
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
