import { NextResponse } from 'next/server';
import { TEAM_SLACK_IDS, mention } from '@/lib/team-slack';

// Server-side only: posts to the dedicated Trial Reels Slack channel. The webhook
// URL is read from SLACK_TRIALREELS_WEBHOOK_URL (no NEXT_PUBLIC_ prefix, so it
// never reaches the browser bundle). Missing/empty → skip silently.
//
// Three ping kinds only:
//   • queue_digest     — ONE message per confirmed daily batch, @-mentioning the
//     assigned editor and linking to the board (one message can't deep-link N
//     reels). The editor mention is resolved client-side (assigned_to_user_id →
//     profile → slack_user_id) and passed in pre-built.
//   • in_review        — a single production row moved to In Review; pings the
//     reviewer (Claudiu, from the hardcoded TEAM_SLACK_IDS) with the Open-in-OS link.
//   • revisions_needed — a single production row moved to Revisions Needed; pings
//     the ASSIGNED EDITOR (mention resolved client-side, same chain as the digest)
//     with the reel's Open-in-OS link.
// Editing / Posted / Assigned fire no ping here (Assigned is covered by the batch
// digest at queue-confirm).

export async function POST(request: Request) {
  const webhookUrl = process.env.SLACK_TRIALREELS_WEBHOOK_URL;
  if (!webhookUrl) return NextResponse.json({ skipped: true });

  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  let kind = '';
  let editorMention = '';
  let boardUrl = '';
  let count = 0;
  let itemUrl = '';
  let description = '';
  let sourceUrl = '';
  try {
    const b = await request.json();
    kind = str(b?.kind);
    editorMention = str(b?.editorMention);
    boardUrl = str(b?.boardUrl);
    count = Number(b?.count) || 0;
    itemUrl = str(b?.itemUrl);
    description = str(b?.description);
    sourceUrl = str(b?.sourceUrl);
  } catch {
    // ignore malformed body; the guard below handles the empty kind
  }

  // "Source:" line — links to the ORIGINAL POSTED reel (source's posted URL) using
  // the description as the clickable label. Falls back to plain-text description
  // when the source has no posted URL (never renders a broken link). Null when
  // there's no description to show.
  const sourceLine = (): string | null => {
    if (!description) return null;
    return sourceUrl ? `Source: <${sourceUrl}|${description}>` : `Source: ${description}`;
  };

  // Logical blocks separated by a blank line (double newline); null blocks drop.
  let blocks: (string | null)[] = [];
  if (kind === 'queue_digest') {
    const editor = editorMention || '⚠️ Unassigned — set an editor';
    const n = count > 0 ? count : 0;
    blocks = [
      `🎬 ${editor} ${n} trial reel${n === 1 ? '' : 's'} queued for today.`,
      boardUrl ? `<${boardUrl}|🔗 Open today's queue>` : null,
    ];
  } else if (kind === 'in_review') {
    blocks = [
      `🟣 A trial reel is ready for review, ${mention(TEAM_SLACK_IDS.claudiu)}!`,
      itemUrl ? `<${itemUrl}|🔗 Open in OS>` : null,
      sourceLine(),
    ];
  } else if (kind === 'revisions_needed') {
    const editor = editorMention || '⚠️ Unassigned — set an editor';
    blocks = [
      `🔴 Revisions needed on your trial reel, ${editor}.`,
      itemUrl ? `<${itemUrl}|🔗 Open in OS>` : null,
      sourceLine(),
    ];
  } else {
    return NextResponse.json({ skipped: true });
  }

  const text = blocks.filter((b): b is string => b !== null).join('\n\n');
  if (!text) return NextResponse.json({ skipped: true });

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
