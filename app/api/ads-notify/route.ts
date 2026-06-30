import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// Server-side only: posts to the #ad-creative-pipeline Slack webhook when an Ad
// Creative transitions into (or is created at) one of the pipeline statuses. The
// webhook URL is read from SLACK_AD_PIPELINE_WEBHOOK_URL, falling back to
// SLACK_WEBHOOK_URL — neither has a NEXT_PUBLIC_ prefix so the URL never reaches
// the browser bundle. People are @-mentioned by resolving their name through the
// slack_user_map table (person_name -> slack_user_id).

// Statuses that fire a ping. Editing / Testing / Winner / Killed are intentionally
// silent (the client never sends them, but we guard here too).
const NOTIFY = new Set(['Ad Creative Needed', 'Ready for Review', 'Revisions Needed', 'Ready to Test']);

export async function POST(request: Request) {
  const webhookUrl = process.env.SLACK_AD_PIPELINE_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  // Missing/empty webhook → skip silently, don't crash.
  if (!webhookUrl) return NextResponse.json({ skipped: true });

  let status = '';
  let creativeId = '';
  let editor = '';
  let sourceLink = '';
  let buyerFeedback = '';
  try {
    const b = await request.json();
    status = typeof b?.status === 'string' ? b.status.trim() : '';
    creativeId = typeof b?.creativeId === 'string' ? b.creativeId.trim() : '';
    editor = typeof b?.editor === 'string' ? b.editor.trim() : '';
    sourceLink = typeof b?.sourceLink === 'string' ? b.sourceLink.trim() : '';
    buyerFeedback = typeof b?.buyerFeedback === 'string' ? b.buyerFeedback.trim() : '';
  } catch {
    // ignore malformed body; the guard below handles the empty status
  }

  // Unknown/non-notify status → no message (guard against stray calls).
  if (!NOTIFY.has(status)) return NextResponse.json({ skipped: true });

  // Resolve @-mentions from slack_user_map. A present slack_user_id becomes a real
  // Slack mention; a missing one falls back to plain text that still posts and
  // flags the gap so it gets filled in via the "Team Slack IDs" editor.
  let map: { person_name: string; slack_user_id: string | null }[] = [];
  try {
    const sb = createServerClient();
    const { data } = await sb.from('slack_user_map').select('person_name, slack_user_id');
    map = data ?? [];
  } catch {
    // No table / query failure → mentions degrade to the "(Slack ID not set)" form.
  }
  const mention = (name: string): string => {
    const n = name.trim();
    if (!n) return '';
    const row = map.find(m => (m.person_name || '').trim().toLowerCase() === n.toLowerCase());
    const id = row?.slack_user_id?.trim();
    return id ? `<@${id}>` : `@${n} (Slack ID not set)`;
  };

  const id = creativeId || 'this creative';
  let text = '';
  switch (status) {
    case 'Ad Creative Needed':
      text = editor
        ? `🎬 New ad creative needed — *${id}*, assigned to ${mention(editor)}.${sourceLink ? ` ${sourceLink}` : ''}`
        : `🎬 New ad creative needed — *${id}*, ⚠️ unassigned — set an editor.${sourceLink ? ` ${sourceLink}` : ''}`;
      break;
    case 'Ready for Review':
      // Single combined review gate — ping both reviewers in one message.
      text = `${mention('Claudiu')} ${mention('Colin')} 👀 *${id}* is ready for review — take a look.`;
      break;
    case 'Revisions Needed':
      text = `🔁 Revisions needed on *${id}* — back to ${editor ? mention(editor) : '⚠️ an editor (unassigned)'}.${buyerFeedback ? ` ${buyerFeedback}` : ''}`;
      break;
    case 'Ready to Test':
      text = `${mention('Colin')} 🚀 *${id}* approved — ready to test, over to you.`;
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
