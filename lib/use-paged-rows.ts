'use client';
import { useState, useEffect } from 'react';

// Notion-style "Load more" pagination for the Studio tables. Renders an initial
// batch and reveals more in PAGE_SIZE increments. The visible count resets to
// the first page only when the filter/sort criteria change (`resetKey`), NOT on
// every data refresh — so editing a cell (which reloads data) doesn't collapse
// the list back to the first page.
export const PAGE_SIZE = 25;

export function usePagedRows<T>(rows: T[], resetKey: string) {
  const [count, setCount] = useState(PAGE_SIZE);
  useEffect(() => { setCount(PAGE_SIZE); }, [resetKey]);

  const visible = count >= rows.length ? rows : rows.slice(0, count);
  const remaining = Math.max(0, rows.length - count);
  return {
    visible,
    hasMore: remaining > 0,
    remaining,
    loadMore: () => setCount(c => c + PAGE_SIZE),
  };
}
