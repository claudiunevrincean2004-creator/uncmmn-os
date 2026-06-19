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

export type MainPage = 'dashboard' | 'content' | 'research' | 'goals' | 'drive';

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
