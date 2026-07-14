'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

// Per-item entry point for a clipper (the target of a copied "Copy link"). The
// app itself is a single-page client app, so this thin route hands off to the
// root with a deep-link param that opens the Clippers tab on this clipper's
// dashboard.
export default function ClipperItemRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    const id = String(params?.id ?? '');
    router.replace(id ? `/?item=clipper:${encodeURIComponent(id)}` : '/');
  }, [params, router]);
  return null;
}
