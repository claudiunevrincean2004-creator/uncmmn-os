// Single source of truth for the FIXED-SEAT people in Slack pings (Claudiu,
// Colin, Nathan). These three are hardcoded by Slack member ID and mentioned as
// real <@ID> pings. Editor pings are NOT here — they resolve dynamically per row
// via assigned_to_user_id → profile → slack_user_id.
export const TEAM_SLACK_IDS = {
  claudiu: 'U068NM9A4SV',
  colin: 'U03SBBU52V6',
  nathan: 'U01HPS0NN9L',
};

// Build a real Slack mention (<@ID>) from a member id.
export const mention = (id: string): string => `<@${id}>`;


// ── Finance ─────────────────────────────────────────────────────────────────
// The person who settles payments, pinged when a payment reaches Ready to Pay.
//
// Deliberately NOT a hardcoded member id like the three above, and deliberately
// NOT an env var: their Slack id already lives in the OS, on
// profiles.slack_user_id — the same column every editor ping resolves through
// (see slackMentionByAssignee). This matches the profile by display name and
// reads the id off that row, so if their Slack id ever changes, updating the
// profile in Manage all users is the whole fix.
export const FINANCE_APPROVER_NAME = 'Maciek';

/**
 * `<@U…>` for the finance approver, or a flagged plain-text fallback.
 *
 * The fallback is the same philosophy the editor pings use: a missing Slack id
 * must never swallow the message, so it still posts and says what's missing.
 * Plain text does NOT notify anybody, which is exactly why it names the gap.
 */
export function financeApproverMention(
  profiles: { display_name?: string | null; slack_user_id?: string | null }[],
): string {
  const want = FINANCE_APPROVER_NAME.toLowerCase();
  const match = profiles.find(p => (p.display_name || '').trim().toLowerCase().startsWith(want));
  const sid = (match?.slack_user_id || '').trim();
  if (sid) return mention(sid);
  return `@${FINANCE_APPROVER_NAME} (Slack ID not set in the OS)`;
}
