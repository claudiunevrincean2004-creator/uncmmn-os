'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

// Per-item entry point for a Video Review row (the target of "Open in UNCMMN OS"
// links in Slack pings). The app itself is a single-page client app, so this thin
// route hands off to the root with a deep-link param that opens the Studio →
// Video Review tab with this row's side panel (where comments live).
export default function VideoItemRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    const id = String(params?.id ?? '');
    router.replace(id ? `/?item=video:${encodeURIComponent(id)}` : '/');
  }, [params, router]);
  return null;
}
