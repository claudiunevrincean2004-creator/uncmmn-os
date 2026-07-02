'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

// Per-item entry point for a Trial Reels production row (the target of "Open in OS"
// links in the Trial Reels Slack pings). The app is a single-page client app, so
// this thin route hands off to the root with a deep-link param that opens the
// Trial Reels tab → Production Board with this row's detail panel.
export default function TrialReelItemRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    const id = String(params?.id ?? '');
    router.replace(id ? `/?item=trialreel:${encodeURIComponent(id)}` : '/');
  }, [params, router]);
  return null;
}
