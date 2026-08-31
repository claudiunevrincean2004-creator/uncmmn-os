'use client';
import { MainPage } from '@/lib/types';
import { Role, canAccess } from '@/lib/auth-config';
import StarLogo from '@/components/StarLogo';
import Avatar from '@/components/Avatar';
import Icon, { type IconName } from '@/components/Icon';

interface NavItem {
  key: MainPage;
  label: string;
  icon: IconName;
}

// One line-icon per destination, drawn from the shared set so the column reads
// as a single family. They stroke in currentColor, so an active item's glyph
// turns --accent along with its label.
//
// Trial Reels and Clippers are HIDDEN FROM THE NAV ONLY — their pages, routes,
// components, tables and data are all still here and still work. To bring them
// back, move their entry out of HIDDEN_NAV below; nothing else needs touching.
const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'content', label: 'Content', icon: 'document' },
  { key: 'research', label: 'Research', icon: 'search' },
  { key: 'studio', label: 'Studio', icon: 'playSquare' },
  { key: 'cliplibrary', label: 'Clip Library', icon: 'stack' },
  { key: 'drive', label: 'Assets', icon: 'archive' },
  // Admin-only, gated by canAccess exactly like Clippers — an editor or clipper
  // never sees this entry, because the filter below drops it before render.
  { key: 'finance', label: 'Finance', icon: 'dollar' },
];

/** Parked nav entries — restore one by moving it back into NAV. */
const HIDDEN_NAV: NavItem[] = [
  { key: 'trialreels', label: 'Trial Reels', icon: 'film' },
  { key: 'clippers', label: 'Clippers', icon: 'scissors' },
];
void HIDDEN_NAV; // kept for reference, deliberately not rendered

interface Props {
  activeMP: MainPage;
  collapsed: boolean;
  role: Role;
  userName: string;
  // Comments this user hasn't seen yet (0 → no badge).
  unreadCount: number;
  onToggleCollapse: () => void;
  onSelectMain: (page: MainPage) => void;
  onOpenInbox: () => void;
  onOpenAccount: () => void;
  onLogout: () => void;
}

// Blue unread pill. Collapsed, it shrinks to a bare dot pinned to the icon —
// there's no room for a number at 56px.
function UnreadBadge({ count, dot }: { count: number; dot?: boolean }) {
  if (count < 1) return null;
  const base = {
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 999,
    fontWeight: 700,
    lineHeight: 1,
    flexShrink: 0,
  } as const;
  if (dot) {
    return <span aria-label={`${count} unread`} style={{ ...base, position: 'absolute', top: 4, right: 8, width: 8, height: 8 }} />;
  }
  return (
    <span aria-label={`${count} unread`} style={{ ...base, fontSize: 10, padding: '2px 6px', minWidth: 18, textAlign: 'center' }}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function Sidebar({ activeMP, collapsed, role, userName, unreadCount, onToggleCollapse, onSelectMain, onOpenInbox, onOpenAccount, onLogout }: Props) {
  const w = collapsed ? 56 : 210;
  // Layer 3 — only render the tabs this role is allowed to see
  const nav = NAV.filter(item => canAccess(role, item.key));

  return (
    <div style={{
      width: w,
      minWidth: w,
      background: 'var(--surface)',
      borderRight: '0.5px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative',
      transition: 'width 0.2s ease, min-width 0.2s ease',
    }}>
      <button
        onClick={onToggleCollapse}
        style={{
          position: 'absolute',
          top: 20,
          right: -12,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'var(--surface-2)',
          border: '0.5px solid var(--border)',
          color: 'var(--text-faint)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          zIndex: 10,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-faint)'; }}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '›' : '‹'}
      </button>

      {/* Star alone — no wordmark. Expanded, its left edge lines up with the nav
          icons below (8px list padding + 12px item padding); collapsed, it
          centres. The header keeps its original height either way. */}
      <div style={{ padding: collapsed ? '18px 8px 14px' : '18px 20px 14px', borderBottom: '0.5px solid var(--border)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <div className="logo-lockup" style={{ justifyContent: collapsed ? 'center' : 'flex-start' }} title="uncmmn OS">
          <StarLogo size={collapsed ? 26 : 24} />
        </div>
      </div>

      <div className="nav-list" style={{ padding: collapsed ? '12px 4px' : '12px 8px', flex: 1 }}>
        {nav.map(item => (
          <div
            key={item.key}
            className={`nav-item${activeMP === item.key ? ' active' : ''}`}
            onClick={() => onSelectMain(item.key)}
            title={item.label}
            style={collapsed ? { justifyContent: 'center', padding: '11px 0' } : undefined}
          >
            <Icon name={item.icon} size={19} />
            {!collapsed && <span>{item.label}</span>}
          </div>
        ))}
      </div>

      <div className="nav-list" style={{ padding: collapsed ? '12px 4px' : '12px 8px', borderTop: '0.5px solid var(--border)' }}>
        {/* Inbox — comment activity across every tab. Sits directly above the
            profile, the way Notion anchors it to the bottom of the sidebar. */}
        <div
          className="nav-item"
          onClick={onOpenInbox}
          title={unreadCount > 0 ? `Inbox — ${unreadCount} unread` : 'Inbox'}
          style={collapsed ? { justifyContent: 'center', padding: '11px 0', position: 'relative' } : { position: 'relative' }}
        >
          <Icon name="mail" size={19} />
          {!collapsed && <span>Inbox</span>}
          {!collapsed && <div style={{ flex: 1 }} />}
          <UnreadBadge count={unreadCount} dot={collapsed} />
        </div>
        <div
          className="nav-item"
          onClick={onOpenAccount}
          title={`${userName} — account`}
          style={collapsed ? { justifyContent: 'center', padding: '11px 0' } : { gap: 11 }}
        >
          <Avatar name={userName} size={22} />
          {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</span>}
        </div>
        <div
          className="nav-item"
          onClick={onLogout}
          title="Sign out"
          style={collapsed ? { justifyContent: 'center', padding: '11px 0' } : undefined}
        >
          <Icon name="power" size={19} />
          {!collapsed && <span>Sign out</span>}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: collapsed ? 'center' : undefined, padding: collapsed ? 0 : '0 2px' }}>v1.0.0</div>
      </div>
    </div>
  );
}
