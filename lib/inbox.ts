import { StudioComment } from './types';

// Where an inbox entry sends you when clicked. Mirrors the existing deep-link
// mechanism the Slack pings already use (page.tsx `deepLink` / `trialReelOpenId`),
// so clicking an entry opens the very same side panel.
export type InboxTarget =
  | { page: 'studio'; type: 'video' | 'ad' | 'story' | 'filming' }
  | { page: 'trialreels' };

// Every comment-bearing surface in the app, keyed by studio_comments.item_type —
// the string each table passes to ItemPanel. A new commentable tab only has to add
// an entry here and the Inbox picks its comments up.
export const INBOX_SOURCES: Record<string, { tab: string; target: InboxTarget }> = {
  video: { tab: 'Video Review', target: { page: 'studio', type: 'video' } },
  ad: { tab: 'Ad Creative', target: { page: 'studio', type: 'ad' } },
  sequence: { tab: 'Story Sequences', target: { page: 'studio', type: 'story' } },
  session: { tab: 'Filming Sessions', target: { page: 'studio', type: 'filming' } },
  trialreel: { tab: 'Trial Reels', target: { page: 'trialreels' } },
};

// Unread = a comment by SOMEONE ELSE that this user has no comment_reads row for.
// Your own comments are never unread for you, so posting never lights your badge.
//
// Replies count exactly the same: a reply is a studio_comments row carrying its
// parent's item_type/item_id (plus parent_comment_id), so someone answering your
// comment lights the badge and lands in the Inbox with no special-casing here.
export function isUnread(c: StudioComment, currentUserId: string | null, readIds: Set<string>): boolean {
  if (!currentUserId) return false;
  if (c.author_id === currentUserId) return false;
  return !readIds.has(c.id);
}

export function unreadCount(comments: StudioComment[], currentUserId: string | null, readIds: Set<string>): number {
  return comments.filter(c => isUnread(c, currentUserId, readIds)).length;
}
