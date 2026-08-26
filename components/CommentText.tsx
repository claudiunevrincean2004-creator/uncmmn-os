'use client';
import { Fragment } from 'react';
import { Profile } from '@/lib/types';
import { segmentComment } from '@/lib/mentions';
import { linkify } from '@/lib/linkify';

// A comment body with its URLs made clickable and its @mentions highlighted. A
// mention of the signed-in user is filled (so "someone is talking to me" pops out
// of a wall of comments); mentions of other people are tinted but quiet.
//
// URLs are tokenized first and mentions only within what's left over, so a link
// carrying a handle ("tiktok.com/@someone/video/1") stays one whole link.
export default function CommentText({
  text, profiles, currentUserId, clamp, links = true,
}: {
  text: string;
  profiles: Profile[];
  currentUserId?: string | null;
  // Truncate to this many characters (Inbox rows); omit for the full body.
  clamp?: number;
  // Render URLs as anchors. Callers that already sit inside a click target pass
  // false: an <a> nested in a <button> is invalid HTML and breaks hydration.
  // URLs are still tokenized when off — they just render as plain text, which
  // also keeps a handle inside a URL from being mistaken for a mention.
  links?: boolean;
}) {
  const body = clamp && text.length > clamp ? `${text.slice(0, clamp).trimEnd()}…` : text;
  return (
    <>
      {linkify(body).map((part, i) => {
        if (part.href) {
          if (!links) return <span key={i}>{part.text}</span>;
          return (
            <a
              key={i}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              // Long URLs are common in comments and the panel is narrow, so let
              // one wrap mid-string rather than push the column wide.
              className="link-anim"
              style={{ color: 'var(--accent)', overflowWrap: 'anywhere' }}
            >
              {part.text}
            </a>
          );
        }
        return (
          <Fragment key={i}>
            {segmentComment(part.text, profiles).map((seg, j) => {
              if (!seg.userId) return <span key={j}>{seg.text}</span>;
              const isMe = !!currentUserId && seg.userId === currentUserId;
              return (
                <span
                  key={j}
                  style={{
                    color: isMe ? '#fff' : 'var(--accent)',
                    background: isMe ? 'var(--accent)' : 'transparent',
                    borderRadius: 4,
                    padding: isMe ? '0 4px' : undefined,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {seg.text}
                </span>
              );
            })}
          </Fragment>
        );
      })}
    </>
  );
}
