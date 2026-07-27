'use client';

// Lightweight emoji picker — a compact fixed grid of common reactions, no heavy
// dependency. Rendered as a small popover; the parent owns open/close state and
// wraps it in a `position: relative` container so the popover anchors to the
// trigger. A transparent full-screen backdrop closes it on any outside click
// (this sidesteps the mousedown-then-click race an outside-click hook would hit
// against the very button that opened it).

// Curated set of the reactions people actually reach for. Kept to 12 (two rows of
// six) so the popover stays small; extend here if the team wants more.
export const REACTION_EMOJIS = ['✅', '👍', '👀', '❤️', '😂', '🔥', '🙏', '😮', '🎉', '💯', '👎', '😢'];

export default function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  return (
    <>
      {/* Outside-click catcher — clicking anywhere but the grid closes the picker. */}
      <div aria-hidden onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1402 }} />
      <div
        role="menu"
        style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: 6,
          zIndex: 1403,
          background: 'var(--surface)',
          border: '0.5px solid var(--border)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-lg)',
          padding: 6,
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 2,
          width: 'max-content',
        }}
      >
        {REACTION_EMOJIS.map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            title={`React ${emoji}`}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
              borderRadius: 6,
              transition: 'background 0.12s, transform 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.transform = 'scale(1.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}
