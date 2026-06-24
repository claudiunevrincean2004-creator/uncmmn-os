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

export interface Goal {
  id: string;
  client_id: string;
  name: string;
  current_val: number;
  target_val: number;
  platform: string;
  created_at?: string;
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

export type MainPage = 'dashboard' | 'content' | 'research' | 'goals' | 'drive' | 'studio';

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
  created_at?: string;
}

export interface StudioAdCreative {
  id: string;
  source_video_title?: string;
  source_video_url?: string;
  ad_format?: string;
  cta_type?: string;
  custom_cta?: string;
  status: string;
  creative_url?: string;
  platform?: string;
  deadline?: string;
  notes?: string;
  assigned_to?: string;
  created_at?: string;
}

export interface StudioComment {
  id: string;
  item_type: string;
  item_id: string;
  text: string;
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
  script_url?: string;
  date?: string;
  location?: string;
  status: string;
  videos_planned: number;
  videos_filmed: number;
  notes?: string;
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
