import { NextResponse } from 'next/server';
import { TEAM_SLACK_IDS, mention } from '@/lib/team-slack';

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
  let itemUrl = '';
  let sourceLink = '';
  let finalLink = '';
  let editorMention = '';
  try {
    const b = await request.json();
    status = str(b?.status);
    itemUrl = str(b?.itemUrl);
    sourceLink = str(b?.sourceLink);
    finalLink = str(b?.finalLink);
    editorMention = str(b?.editorMention);
  } catch {
    // ignore malformed body; the guard below handles the empty status
  }

  // Unknown/non-notify status → no message (guard against stray calls).
  if (!NOTIFY.has(status)) return NextResponse.json({ skipped: true });

  const editor = editorMention || '⚠️ Unassigned — set an editor';
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
    case 'Ad Creative Needed':
      blocks = [
        `🟠 New ad creative needed, ${editor}!`,
        openLine,
        block([`Source link: ${sourceLink}`]),
      ];
      break;
    case 'Ready for Review':
      // Single combined review gate — ping both reviewers in one message. The
      // link is the Ad Creative's OWN Final cut; omit the line when it's empty.
      blocks = [
        `🟡 New ad creative ready for review, ${mention(TEAM_SLACK_IDS.claudiu)} ${mention(TEAM_SLACK_IDS.colin)}!`,
        openLine,
        block([finalLink ? `Take a peek: ${finalLink}` : null]),
      ];
      break;
    case 'Revisions Needed':
      blocks = [
        `🔴 Revisions needed, ${editor}.`,
        openLine,
        block([
          'Check comments for the revisions.',
          finalLink ? `Find the final product here: ${finalLink}` : null,
        ]),
      ];
      break;
    case 'Ready to Test':
      blocks = [
        `🟢 Ad creative approved, ready to test — ${mention(TEAM_SLACK_IDS.colin)}!`,
        openLine,
        block([finalLink ? `Find the final product here: ${finalLink}` : null]),
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
