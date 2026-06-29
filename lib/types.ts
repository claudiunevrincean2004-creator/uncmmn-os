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

export type MainPage = 'dashboard' | 'content' | 'research' | 'drive' | 'studio';

export interface StudioVideo {
  id: string;
  title: string;
  format?: string;
  assigned_to?: string;
  status: string;
  priority: string;
  brief_url?: string;
  raw_files_url?: string;
  final_url?: string;
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
  assigned_to?: string;
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

export interface Profile {
  id: string;
  role?: string;
  assignable?: boolean;
  email?: string | null;
  display_name?: string | null;
  job_title?: string | null;
  created_at?: string;
}

export interface StudioComment {
  id: string;
  item_type: string;
  item_id: string;
  text: string;
  author_id?: string | null;
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
