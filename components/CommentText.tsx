'use client';
import { Profile } from '@/lib/types';
import { segmentComment } from '@/lib/mentions';

// A comment body with its @mentions highlighted. A mention of the signed-in user
// is filled (so "someone is talking to me" pops out of a wall of comments);
// mentions of other people are tinted but quiet.
export default function CommentText({
  text, profiles, currentUserId, clamp,
}: {
  text: string;
  profiles: Profile[];
  currentUserId?: string | null;
  // Truncate to this many characters (Inbox rows); omit for the full body.
  clamp?: number;
}) {
  const body = clamp && text.length > clamp ? `${text.slice(0, clamp).trimEnd()}…` : text;
  return (
    <>
      {segmentComment(body, profiles).map((seg, i) => {
        if (!seg.userId) return <span key={i}>{seg.text}</span>;
        const isMe = !!currentUserId && seg.userId === currentUserId;
        return (
          <span
            key={i}
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
    </>
  );
}
