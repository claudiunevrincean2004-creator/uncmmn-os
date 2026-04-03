// Format number with commas
export function fn(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toLocaleString();
}

// Format money
export function fm(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '$0';
  return '$' + Math.round(n).toLocaleString();
}

// Percent change
export function pc(a: number, b: number): string {
  if (!b) return '+0%';
  const diff = ((a - b) / b) * 100;
  return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
}

// Engagement rate
export function er(post: { views: number; likes: number; comments: number; shares: number; saves: number }): number {
  if (!post.views) return 0;
  return ((post.likes + post.comments + post.shares + post.saves) / post.views) * 100;
}

// Stars string
export function stars(rating: number): string {
  return '★'.repeat(Math.min(5, Math.max(0, rating))) + '☆'.repeat(5 - Math.min(5, Math.max(0, rating)));
}

// Color array
export const CC = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16'];

// Platform display config
export const PD: Record<string, { color: string; label: string }> = {
  Instagram: { color: '#E1306C', label: 'IG' },
  TikTok: { color: '#69C9D0', label: 'TT' },
  YouTube: { color: '#ff6b6b', label: 'YT' },
  All: { color: '#6366f1', label: 'All' },
};

export function getPlatformColor(platform: string): string {
  return PD[platform]?.color || '#6366f1';
}

export function getColor(index: number): string {
  return CC[index % CC.length];
}

// Average of an array
export function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
