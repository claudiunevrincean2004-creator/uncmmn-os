import { createBrowserClient } from '@supabase/ssr';

// Cookie-backed browser client so the session is readable by Next.js middleware.
// Same API surface as before (supabase.from / supabase.auth), so existing imports keep working.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
