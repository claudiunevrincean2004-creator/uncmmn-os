export type ClientType = 'DFY — Agency' | 'Consulting' | 'Coaching' | 'Partnership' | 'Other';
export type BillingType = 'Retainer' | 'One-time';

export interface Client {
  id: string;
  name: string;
  niche: string;
  retainer: number;
  cost: number;
  platforms: string[];
  status?: 'Active' | 'Inactive' | 'Paused';
  client_type?: ClientType;
  billing_type?: BillingType;
  renewal_date?: string;
  start_date?: string;
  inactive_date?: string;
  notes?: string;
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

export interface Hook {
  id: string;
  client_id: string;
  text: string;
  category: string;
  rating: number;
  created_at?: string;
}

export interface Format {
  id: string;
  client_id: string;
  name: string;
  platform: string;
  avg_views: number;
  avg_eng: number;
  notes: string;
  created_at?: string;
}

export interface Pillar {
  id: string;
  client_id: string;
  name: string;
  description: string;
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

export interface Expense {
  id: string;
  name: string;
  cost: number;
  category: string;
  created_at?: string;
}

export interface MonthlyRevenue {
  id: string;
  client_id: string;
  month: string; // YYYY-MM
  amount: number;
  created_at?: string;
}

export interface MonthlyExpense {
  id: string;
  name: string;
  cost: number;
  category: string;
  month: string; // YYYY-MM
  created_at?: string;
}

export interface ClientExpense {
  id: string;
  client_id: string;
  name: string;
  amount: number;
  category: string;
  month: string; // YYYY-MM
  created_at?: string;
}

export interface ClientMonthExclusion {
  id: string;
  client_id: string;
  month: string; // YYYY-MM
  created_at?: string;
}

export interface ConsultingCall {
  id: string;
  client_id: string;
  date: string;
  duration_minutes: number;
  amount: number;
  notes: string;
  created_at?: string;
}

export interface ConsultingIdea {
  id: string;
  client_id: string;
  text: string;
  status: 'Pending' | 'Discussed' | 'Implemented';
  created_at?: string;
}

export type MainPage = 'overview' | 'finance' | 'clients' | 'client';
export type ClientTab = 'overview' | 'content' | 'outliers' | 'goals' | 'hooks' | 'formats' | 'pillars' | 'drive';
