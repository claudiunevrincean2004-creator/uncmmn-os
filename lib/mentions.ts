import { Profile } from './types';
import { profileName } from './profile-name';

// Comments store their body as plain text with mentions written literally as
// "@Display Name" (exactly what the picker inserts). The mentioned profile ids
// are re-derived from that text on every save and stored in studio_comments.mentions,
// so editing a mention out of the body also drops it from the array — the two can
// never disagree. This module is the single tokenizer behind all three uses:
// saving (parseMentions), highlighting (segmentComment), and the Inbox filter.

export interface CommentSegment {
  text: string;
  // Set when this segment is an "@Name" that resolves to a real user.
  userId?: string;
}

// Split a comment body into plain-text and mention segments. Names are matched
// longest-first so "@Ana Maria" wins over a shorter "@Ana" that prefixes it,
// and matching is case-insensitive so "@sufyan" still resolves.
export function segmentComment(text: string, profiles: Profile[]): CommentSegment[] {
  const tokens = profiles
    .map(p => ({ id: p.id, token: `@${profileName(p)}`.toLowerCase() }))
    .sort((a, b) => b.token.length - a.token.length);

  const segments: CommentSegment[] = [];
  const lower = text.toLowerCase();
  let plain = '';
  let i = 0;

  while (i < text.length) {
    if (text[i] === '@') {
      const hit = tokens.find(t => lower.startsWith(t.token, i));
      if (hit) {
        if (plain) { segments.push({ text: plain }); plain = ''; }
        segments.push({ text: text.slice(i, i + hit.token.length), userId: hit.id });
        i += hit.token.length;
        continue;
      }
    }
    plain += text[i];
    i++;
  }
  if (plain) segments.push({ text: plain });
  return segments;
}

// The profile ids mentioned in a comment body — what gets written to
// studio_comments.mentions. Deduped, order-insensitive.
export function parseMentions(text: string, profiles: Profile[]): string[] {
  const ids = segmentComment(text, profiles)
    .map(s => s.userId)
    .filter((id): id is string => !!id);
  return Array.from(new Set(ids));
}
