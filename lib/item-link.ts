// Canonical deep links to a single item's own page.
//
// Every item type has a thin route under app/<route>/[id] that redirects to
// "/?item=<type>:<id>", which the root page consumes to open that item's tab and
// side panel. These are the URLs Slack pings link to ("🔗 Open in OS") and the
// ones the in-app "Copy link" control puts on the clipboard — one map, so the two
// can't drift apart.

export type ItemType = 'video' | 'ad' | 'story' | 'filming' | 'trialreel' | 'clip' | 'clipper';

const ITEM_ROUTES: Record<ItemType, string> = {
  video: '/studio/video',
  ad: '/studio/ad-creative',
  story: '/studio/story',
  filming: '/studio/filming',
  trialreel: '/trialreel',
  clip: '/clip',
  clipper: '/clipper',
};

export function itemPath(type: ItemType, id: string): string {
  return `${ITEM_ROUTES[type]}/${encodeURIComponent(id)}`;
}

// Absolute URL to an item's page. Empty string when there's no window (SSR) —
// callers that hand this to Slack fall back to a plain title with no link.
export function itemUrl(type: ItemType, id: string): string {
  return typeof window !== 'undefined' ? `${window.location.origin}${itemPath(type, id)}` : '';
}

// Copy an item's deep link to the clipboard. The async Clipboard API is only
// available in secure contexts, so fall back to a hidden textarea + execCommand
// (deprecated but still the only option on plain-http hosts). Resolves false when
// both paths fail so the caller can say so instead of claiming a silent success.
export async function copyItemLink(type: ItemType, id: string): Promise<boolean> {
  const url = itemUrl(type, id);
  if (!url) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // Permission denied or a non-secure context — try the legacy path below.
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
