export interface Client {
  id: string;
  name: string;
  niche?: string;
  platforms: string[];
  created_at?: string;
}

export interface Post {
  id: string;
  client_id: string;
  title: string;
  platform: string;
  format: string;
  pillar: string;
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  follows: number;
  drive_link: string;
  post_url?: string;
  created_at?: string;
}

export interface SubscriberSnapshot {
  id?: string;
  client_id: string;
  platform: string;
  subscriber_count: number;
  date: string;
}

export interface DriveFolder {
  id: string;
  client_id: string;
  name: string;
  url: string;
  category: string;
  created_at?: string;
}

export interface RevenueEntry {
  id: string;
  date: string;
  amount: number;
  source?: string;
  notes?: string;
  created_at?: string;
}

export type MainPage = 'dashboard' | 'content' | 'research' | 'drive' | 'studio' | 'clippers' | 'trialreels' | 'cliplibrary';

// A long-form piece in the Clip Library (Overview sheet). name is the unique key.
export interface ClipSource {
  id: string;
  name?: string | null;
  raw_full_version?: string | null;
  date_added?: string | null;
  format?: string | null;
  created_at?: string;
}

// One clip carved from a long-form piece (Snippet database sheet). source_id is a
// best-effort link to ClipSource by name (null when unmatched).
export interface ClipSnippet {
  id: string;
  source_name?: string | null;
  source_id?: string | null;
  description?: string | null;
  full_version_file?: string | null;
  timestamp?: string | null;
  snippet_download_link?: string | null;
  date_added?: string | null;
  format?: string | null;
  created_at?: string;
}

// A backlog reel in the Trial Reels source library (imported/upserted from CSV).
// eligible / times_recreated / last_assigned_at are system fields owned by the
// queue engine and preserved across CSV re-imports.
export interface TrialReelSource {
  id: string;
  posted_url?: string | null;      // Instagram reel link — the unique upsert key
  description?: string | null;
  drive_url?: string | null;
  posted_date?: string | null;
  views?: number | null;
  follows?: number | null;
  follows_per_1k?: number | null;
  contains_talking?: boolean | null;
  full_version_file?: string | null;      // name of the full source video
  timestamp?: string | null;              // exact moment, e.g. "00:05 - 05:21"
  snippet_download_link?: string | null;
  clip_brief?: string | null;             // editor instructions authored in the queue modal
  final_product?: string | null;          // link to the finished original video (CSV "Final product")
  eligible: boolean;
  times_recreated: number;
  last_assigned_at?: string | null; // null = never assigned; drives round-robin
  created_at?: string;
}

// One recreated reel in production. Statuses mirror Video Review's flow.
export interface TrialReelProduction {
  id: string;
  source_id?: string | null;
  assigned_to_user_id?: string | null;
  status: string;
  clip_brief?: string | null;      // per-assignment editor brief (seeded from source, editable on the board)
  final_url?: string | null;       // the new recreated reel, filled by the editor
  queued_date?: string | null;
  created_at?: string;
}

export interface StudioVideo {
  id: string;
  title: string;
  format?: string;
  assigned_to?: string;            // legacy free-text/uuid (kept as migration fallback)
  assigned_to_user_id?: string | null; // canonical reference to profiles.id
  status: string;
  priority: string;
  brief_url?: string;
  raw_files_url?: string;
  final_url?: string;                // the Instagram cut (also the main-table column)
  tiktok_final_url?: string;         // the TikTok cut — different CTA; side panel only
  account?: string;                  // which account this video is for (lib/studio → ACCOUNTS)
  deadline?: string;
  notes?: string;
  revision_count: number;
  created_at?: string;
}

export interface StudioSequence {
  id: string;
  title: string;
  status: string;
  final_url?: string;
  scheduled_date?: string;
  platform?: string;
  notes?: string;
  custom_values?: Record<string, string>;
  created_at?: string;
}

export interface StudioAdCreative {
  id: string;
  creative_id?: string;
  date_added?: string;
  ad_format?: string;
  angle?: string;
  hook?: string;
  buyer_feedback?: string;
  status: string;
  final_link?: string; // Google Drive link to the final product (shown as "Final")
  // legacy columns kept on the table but no longer surfaced in the UI
  source_video_title?: string;
  source_video_url?: string;
  cta_type?: string;
  custom_cta?: string;
  creative_url?: string;
  platform?: string;
  deadline?: string;
  notes?: string;
  assigned_to?: string;            // legacy free-text/uuid (kept as migration fallback)
  assigned_to_user_id?: string | null; // canonical reference to profiles.id
  custom_values?: Record<string, string>;
  created_at?: string;
}

export interface StudioQuickLink {
  id: string;
  context: string;
  label?: string;
  url?: string;
  created_at?: string;
}

export interface StudioDropdownOption {
  id: string;
  field: string;
  value: string;
  color?: string | null;
  position?: number;
  created_at?: string;
}

// DEPRECATED: Slack IDs now live on the user profile (profiles.slack_user_id).
// The slack_user_map table is kept in the DB but no longer read; this type is
// retained only to document that legacy table.
export interface SlackUserMap {
  id: string;
  person_name: string;
  slack_user_id?: string | null;
  created_at?: string;
}

export interface Profile {
  id: string;
  role?: string;
  assignable?: boolean;
  email?: string | null;
  display_name?: string | null;
  job_title?: string | null;
  slack_user_id?: string | null;
  // Clipper tier (role='clipper'). Unused/ignored for admin & editor.
  clipper_status?: string | null; // 'active' | 'inactive'
  joined_at?: string | null;
  created_at?: string;
}

// A social account a clipper runs (Clippers tab, admin-managed).
export interface ClipperAccount {
  id: string;
  clipper_id: string;
  platform?: string; // 'tiktok' | 'instagram' | 'youtube'
  handle?: string;
  account_url?: string;
  status?: string; // 'active' | 'inactive'
  created_at?: string;
}

// A single piece of content a clipper posted. The views/likes/posted_at/
// platform_post_id fields are automation-ready (filled by platform APIs later).
export interface ClipperContent {
  id: string;
  clipper_id: string;
  account_id?: string | null;
  platform?: string;
  content_url?: string;
  title?: string;
  views?: number;
  likes?: number;
  posted_at?: string | null;
  platform_post_id?: string | null;
  created_at?: string;
}

export interface StudioComment {
  id: string;
  item_type: string;
  item_id: string;
  text: string;
  author_id?: string | null;
  // Single-level threading: null on a top-level comment, the top-level comment's
  // id on a reply. A reply to a reply carries the SAME parent (the thread never
  // nests deeper than two rows) — enforced in the UI and by a DB trigger, see
  // supabase/comment_threads.sql. Deleting a parent cascade-deletes its replies.
  parent_comment_id?: string | null;
  // Profile ids @-mentioned in `text`, re-derived from the body on every save
  // (lib/mentions.ts). Drives the Inbox's "Mentions" filter.
  mentions?: string[] | null;
  created_at?: string;
}

// Per-user comment read state — one row per comment the user has seen. Presence
// of a row means read; unread is the absence of one. Powers the Inbox badge.
export interface CommentRead {
  user_id: string;
  comment_id: string;
  read_at?: string;
}

// One emoji reaction: a (comment, user, emoji) triple. The DB unique constraint
// keeps a person from stacking the same emoji twice on one comment; the UI groups
// these by emoji into count pills. See supabase/comment_reactions.sql.
export interface CommentReaction {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at?: string;
}

export interface StudioActivity {
  id: string;
  item_type: string;
  item_id: string;
  action?: string;
  old_value?: string;
  new_value?: string;
  created_at?: string;
}

export interface StudioSession {
  id: string;
  name: string;
  type?: string;
  script_url?: string;
  footage_link?: string;
  date?: string;
  location?: string;
  status: string;
  videos_planned: number;
  videos_filmed: number;
  notes?: string;
  custom_values?: Record<string, string>;
  created_at?: string;
}

// Admin-managed SELECT columns for the customizable Studio tables (not Video Review)
export interface CustomProperty {
  id: string;
  table_key: string; // 'sequence' | 'session' | 'ad'
  name: string;
  position: number;
  created_at?: string;
}

export interface CustomPropertyOption {
  id: string;
  property_id: string;
  label: string;
  color?: string | null;
  position: number;
  created_at?: string;
}

export type ResearchStatus = 'unused' | 'progress' | 'used';

export interface ResearchItem {
  id: string;
  client_id: string;
  title: string;
  content?: string;
  note?: string;
  reason?: string;
  hot: boolean;
  status: ResearchStatus;
  created_at?: string;
}
