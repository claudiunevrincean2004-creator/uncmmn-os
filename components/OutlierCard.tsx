'use client';
import { useEffect, useRef, useState } from 'react';
import { Post } from '@/lib/types';
import { fn, er } from '@/lib/utils';
import PlatformIcon from '@/components/PlatformIcon';

// ============================================================================
// One outlier post — the stats card as it was, plus an on-demand embed of the
// real video. Used by the Dashboard's "Top Outlier Posts" and the Content tab's
// "Outlier Posts"; nothing else renders it.
//
// PERFORMANCE IS THE WHOLE DESIGN HERE. A row of six TikTok/Instagram embeds is
// six third-party scripts, six iframes and a few MB — enough to stall the tab on
// every render. So nothing embed-related happens until a click:
//   1. At rest the card is exactly what it was: title, views, likes, ER, plus a
//      small ▶ Preview affordance. Zero network cost.
//   2. On the first click for a platform, that platform's embed script is
//      fetched ONCE per session (loadEmbedScript's promise cache) and the
//      blockquote is handed to it.
//   3. Every later preview of the same platform reuses the already-loaded
//      script — no second fetch.
// Closing a preview tears the blockquote back out, so a browsed-through row
// doesn't accumulate live iframes.
// ============================================================================

type EmbedKind = 'tiktok' | 'instagram';

interface EmbedTarget {
  kind: EmbedKind;
  /** Canonical permalink the platform's embed expects. */
  url: string;
  /** TikTok's blockquote needs the numeric video id. */
  videoId?: string;
}

const SCRIPTS: Record<EmbedKind, string> = {
  tiktok: 'https://www.tiktok.com/embed.js',
  instagram: 'https://www.instagram.com/embed.js',
};

// One in-flight/settled promise per platform script, shared by every card on the
// page — so six previews never mean six <script> tags.
const scriptPromises: Partial<Record<EmbedKind, Promise<void>>> = {};

function loadEmbedScript(kind: EmbedKind): Promise<void> {
  const cached = scriptPromises[kind];
  if (cached) return cached;

  const p = new Promise<void>((resolve, reject) => {
    const src = SCRIPTS[kind];
    const existing = document.querySelector<HTMLScriptElement>(`script[data-embed="${kind}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') resolve();
      else {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('script failed')));
      }
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.embed = kind;
    s.addEventListener('load', () => { s.dataset.loaded = '1'; resolve(); });
    s.addEventListener('error', () => reject(new Error('script failed')));
    document.body.appendChild(s);
  });

  // A failed load shouldn't be cached forever — a later click can retry.
  scriptPromises[kind] = p.catch(err => { delete scriptPromises[kind]; throw err; });
  return scriptPromises[kind]!;
}

/**
 * What (if anything) we can embed for this post. Returns null when the URL is
 * missing, from another platform, or a shortlink whose id we can't read without
 * following a redirect (vm.tiktok.com) — those cards simply show no preview
 * affordance rather than offering one that can't work.
 */
export function embedTargetFor(post: Post): EmbedTarget | null {
  const raw = (post.post_url || '').trim();
  if (!/^https?:\/\//i.test(raw)) return null;

  let host = '';
  let path = '';
  try {
    const u = new URL(raw);
    host = u.hostname.replace(/^www\./, '').toLowerCase();
    path = u.pathname;
  } catch {
    return null;
  }

  if (host.endsWith('tiktok.com')) {
    const m = path.match(/\/video\/(\d+)/);
    if (!m) return null; // vm.tiktok.com/xxxx — id only known after a redirect
    return { kind: 'tiktok', url: raw.split('?')[0], videoId: m[1] };
  }

  if (host.endsWith('instagram.com')) {
    const m = path.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (!m) return null;
    // Instagram's embed wants the /p/ or /reel/ permalink, no query string.
    const kindSeg = m[1] === 'reels' ? 'reel' : m[1];
    return { kind: 'instagram', url: `https://www.instagram.com/${kindSeg}/${m[2]}/` };
  }

  return null;
}

/** The platform's blockquote, which its script swaps for an iframe in place. */
function embedMarkup(t: EmbedTarget): string {
  if (t.kind === 'tiktok') {
    return `<blockquote class="tiktok-embed" cite="${t.url}" data-video-id="${t.videoId}" style="max-width:100%;min-width:220px;margin:0"><section></section></blockquote>`;
  }
  return `<blockquote class="instagram-media" data-instgrm-permalink="${t.url}" data-instgrm-version="14" style="max-width:100%;min-width:220px;margin:0;width:100%"></blockquote>`;
}

type EmbedState = 'idle' | 'loading' | 'ready' | 'failed';

function Embed({ target, onClose }: { target: EmbedTarget; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<EmbedState>('loading');

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    let giveUp: ReturnType<typeof setTimeout> | undefined;

    node.innerHTML = embedMarkup(target);

    loadEmbedScript(target.kind)
      .then(() => {
        if (cancelled) return;
        // Both scripts scan on load, but a blockquote added later (second
        // preview onwards) needs an explicit nudge.
        const w = window as unknown as {
          instgrm?: { Embeds?: { process?: () => void } };
          tiktokEmbed?: { lib?: { render?: (nodes: Element[]) => void } };
        };
        if (target.kind === 'instagram') w.instgrm?.Embeds?.process?.();
        else w.tiktokEmbed?.lib?.render?.(Array.from(node.querySelectorAll('.tiktok-embed')));

        // A private, deleted or geo-blocked post leaves the blockquote sitting
        // there forever, so success is "an iframe actually appeared".
        poll = setInterval(() => {
          if (cancelled) return;
          if (node.querySelector('iframe')) {
            setState('ready');
            if (poll) clearInterval(poll);
            if (giveUp) clearTimeout(giveUp);
          }
        }, 250);
        giveUp = setTimeout(() => {
          if (cancelled) return;
          if (!node.querySelector('iframe')) setState('failed');
          if (poll) clearInterval(poll);
        }, 8000);
      })
      .catch(() => { if (!cancelled) setState('failed'); });

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      if (giveUp) clearTimeout(giveUp);
      // Drop the iframe on close so a browsed row doesn't keep players alive.
      node.innerHTML = '';
    };
  }, [target]);

  return (
    <div className="outlier-embed" onClick={e => e.stopPropagation()}>
      <div className="outlier-embed-head">
        <span>{state === 'failed' ? 'Preview unavailable' : 'Preview'}</span>
        <button type="button" onClick={onClose} title="Close preview" aria-label="Close preview">✕</button>
      </div>

      {state === 'loading' && <div className="outlier-embed-note">Loading preview…</div>}

      {state === 'failed' && (
        <div className="outlier-embed-note">
          This post can&apos;t be embedded — it may be private, deleted, or restricted.{' '}
          <a className="link-anim" href={target.url} target="_blank" rel="noopener noreferrer">Open on {target.kind === 'tiktok' ? 'TikTok' : 'Instagram'}</a>
        </div>
      )}

      {/* Kept mounted while loading so the script has a node to replace; hidden
          rather than unmounted so a failure doesn't leave a broken frame. */}
      <div ref={hostRef} className="outlier-embed-frame" hidden={state === 'failed'} />
    </div>
  );
}

export default function OutlierCard({ post, multiple }: { post: Post; multiple: number }) {
  const [open, setOpen] = useState(false);
  const link = post.post_url || post.drive_link;
  const target = embedTargetFor(post);

  return (
    <div
      className={`outlier-card${open ? ' is-open' : ''}`}
      style={{ cursor: link ? 'pointer' : 'default' }}
      onClick={() => { if (link) window.open(link, '_blank', 'noopener,noreferrer'); }}
    >
      <div className="outlier-head">
        <span className="badge badge-outlier">{multiple.toFixed(1)}x</span>
        <PlatformIcon platform={post.platform} size={14} />
        {target && (
          <button
            type="button"
            className="outlier-preview-btn"
            onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
            title={open ? 'Hide preview' : 'Load video preview'}
          >
            <span aria-hidden>{open ? '▾' : '▶'}</span>{open ? 'Hide' : 'Preview'}
          </button>
        )}
      </div>

      <div className="outlier-title" title={post.title}>{post.title}</div>

      <div className="outlier-stats">
        {[
          { l: 'Views', v: fn(post.views) },
          { l: 'Likes', v: fn(post.likes) },
          { l: 'ER%', v: `${er(post).toFixed(1)}%` },
        ].map(m => (
          <div key={m.l}>
            <div className="outlier-stat-label">{m.l}</div>
            <div className="outlier-stat-value">{m.v}</div>
          </div>
        ))}
      </div>

      {/* Mounted only once opened — that click is what triggers the very first
          network request for this platform's embed script. */}
      {open && target && <Embed target={target} onClose={() => setOpen(false)} />}
    </div>
  );
}
