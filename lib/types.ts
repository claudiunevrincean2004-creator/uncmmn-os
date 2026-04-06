export interface Client {
  id: string;
  name: string;
  niche: string;
  retainer: number;
  cost: number;
  platforms: string[];
  status?: 'Active' | 'Inactive' | 'Paused';
  renewal_date?: string;
  start_date?: string;
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
  created_at?: string;
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

export type MainPage = 'overview' | 'finance' | 'client';
export type ClientTab = 'overview' | 'content' | 'outliers' | 'goals' | 'hooks' | 'formats' | 'pillars' | 'drive';
