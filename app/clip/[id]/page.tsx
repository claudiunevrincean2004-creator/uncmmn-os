'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

// Per-item entry point for a clip in the Clip Library (the target of a copied
// "Copy link"). The app itself is a single-page client app, so this thin route
// hands off to the root with a deep-link param that opens Clip Library → Clips
// with this clip's source group expanded and the row highlighted.
export default function ClipItemRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    const id = String(params?.id ?? '');
    router.replace(id ? `/?item=clip:${encodeURIComponent(id)}` : '/');
  }, [params, router]);
  return null;
}
