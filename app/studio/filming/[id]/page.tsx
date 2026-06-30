'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

// Per-item entry point for a Filming Session row (the target of "Open in OS" links
// in Slack pings). The app is a single-page client app, so this thin route hands
// off to the root with a deep-link param that opens Studio → Filming Sessions with
// this row's side panel (where details/comments live).
export default function FilmingSessionItemRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    const id = String(params?.id ?? '');
    router.replace(id ? `/?item=filming:${encodeURIComponent(id)}` : '/');
  }, [params, router]);
  return null;
}
