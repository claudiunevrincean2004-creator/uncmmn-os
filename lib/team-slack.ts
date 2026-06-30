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
