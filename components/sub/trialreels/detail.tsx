// Shared read-only detail primitives for the Trial Reels expandable panels (queue
// modal + production board). Links render the ACTUAL url — truncated to domain +
// start of path (e.g. "drive.google.com/file/d/1rhPEx…") — as the clickable link,
// with a clear label on the left and the truncated url on the right.
import { isHttpUrl, shortUrl } from '../studio/cells';

// One shared uppercase caption style for every field/section label.
export const DETAIL_LABEL_STYLE: React.CSSProperties = {
  fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
};

// Labeled block. `inline` lays label + value on one line (for short scalars);
// otherwise the value stacks under the label (for long text like a description).
export function DetailField({ label, children, inline = false }: { label: string; children: React.ReactNode; inline?: boolean }) {
  const lbl = <span style={DETAIL_LABEL_STYLE}>{label}</span>;
  if (inline) return <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{lbl}{children}</div>;
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{lbl}{children}</div>;
}

// One reference-link row: clear label on the left, the truncated clickable url on
// the right. Plain text when the value is a bare filename (not a url), em-dash when
// empty. Generous spacing so a stack of these reads as an organized list.
export function DetailLink({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
      <span style={{ ...DETAIL_LABEL_STYLE, flexShrink: 0, minWidth: 132 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
        {value
          ? (isHttpUrl(value)
              ? <a href={value} target="_blank" rel="noopener noreferrer" title={value} style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom', fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>{shortUrl(value, 46)}</a>
              : <span title={value} style={{ fontSize: 12, color: 'var(--text-dim)', wordBreak: 'break-word' }}>{value}</span>)
          : <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>—</span>}
      </div>
    </div>
  );
}
