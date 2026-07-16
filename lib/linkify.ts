// Comments store their body as plain text and the composer has no link syntax,
// so a pasted URL is just characters until something makes it clickable — that
// something is the renderer, which means old comments light up for free. This is
// the tokenizer behind it: it splits a run of text into plain and link parts.
//
// It runs *before* the mention tokenizer (see lib/mentions.ts), never after:
// social URLs carry handles ("tiktok.com/@someone/video/1"), so letting
// segmentComment see a URL first would tear it in half at the "@" whenever the
// handle happens to match a teammate's display name.

export interface LinkSegment {
  text: string;
  // Set when this segment is a link. Always http(s) — never a scheme that could
  // execute (javascript:, data:), since the scan itself is what allows a URL in.
  href?: string;
}

// An http(s) scheme, then everything up to whitespace. Deliberately greedy: the
// tail is peeled back by trimTrailing, which is the only honest way to tell
// "example.com/a." (sentence period) from "example.com/a.b" (real path).
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

// Brackets that can legitimately sit inside a URL — Wikipedia's "/Foo_(bar)" is
// the classic. Peeled only when unbalanced, i.e. not opened by the URL itself.
const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

// Punctuation a URL can't meaningfully end with, so it belongs to the sentence.
// "…" is here because clamped bodies (Inbox rows) end in one.
const PUNCT = /[.,;:!?'"…]/;

// Peel prose punctuation off a URL's tail: "see https://a.com/x." ends a
// sentence, it doesn't link to "x.".
function trimTrailing(url: string): string {
  let out = url;
  while (out.length > 0) {
    const last = out[out.length - 1];
    const open = PAIRS[last];
    if (open) {
      const opens = out.split(open).length - 1;
      const closes = out.split(last).length - 1;
      // Balanced — this bracket closes one the URL opened, so it's part of it.
      if (closes <= opens) break;
    } else if (!PUNCT.test(last)) {
      break;
    }
    out = out.slice(0, -1);
  }
  return out;
}

// Split text into plain and link segments, in order. Concatenating every
// segment's text reproduces the input exactly — nothing is dropped or rewritten,
// so the body still reads as the author typed it.
export function linkify(text: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  // A fresh regex per call: URL_RE is global, and sharing its lastIndex across
  // calls would make results depend on whatever was scanned before.
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const url = trimTrailing(m[0]);
    // Resume after the trimmed URL, not the raw match, so peeled punctuation is
    // scanned as body text rather than vanishing. Always advances: trimming can
    // never eat past "https://", so this can't loop forever.
    re.lastIndex = m.index + url.length;

    // Trimmed away to a bare scheme ("https://.") — not a link, leave it as text.
    if (!/^https?:\/\/\S/i.test(url)) continue;

    if (m.index > last) segments.push({ text: text.slice(last, m.index) });
    segments.push({ text: url, href: url });
    last = m.index + url.length;
  }

  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}
