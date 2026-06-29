'use client';
import { MainPage } from '@/lib/types';
import { Role, canAccess } from '@/lib/auth-config';
import StarLogo from '@/components/StarLogo';
import Avatar from '@/components/Avatar';

interface NavItem {
  key: MainPage;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '◎' },
  { key: 'content', label: 'Content', icon: '▦' },
  { key: 'research', label: 'Research', icon: '✦' },
  { key: 'studio', label: 'Studio', icon: '◈' },
  { key: 'drive', label: 'Assets', icon: '▤' },
];

interface Props {
  activeMP: MainPage;
  collapsed: boolean;
  role: Role;
  userName: string;
  onToggleCollapse: () => void;
  onSelectMain: (page: MainPage) => void;
  onOpenAccount: () => void;
  onLogout: () => void;
}

export default function Sidebar({ activeMP, collapsed, role, userName, onToggleCollapse, onSelectMain, onOpenAccount, onLogout }: Props) {
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

      <div style={{ padding: collapsed ? '18px 8px 14px' : '18px 14px 14px', borderBottom: '0.5px solid var(--border)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start', lineHeight: 1 }}>
          <StarLogo size={collapsed ? 28 : 30} />
        </div>
      </div>

      <div style={{ padding: collapsed ? '10px 4px' : '10px 8px', flex: 1 }}>
        {nav.map(item => (
          <div
            key={item.key}
            className={`nav-item${activeMP === item.key ? ' active' : ''}`}
            onClick={() => onSelectMain(item.key)}
            title={item.label}
            style={collapsed ? { justifyContent: 'center', padding: '8px 0' } : undefined}
          >
            <span style={{ fontSize: 13 }}>{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </div>
        ))}
      </div>

      <div style={{ padding: collapsed ? '10px 4px' : '10px 8px', borderTop: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          className="nav-item"
          onClick={onOpenAccount}
          title={`${userName} — account`}
          style={collapsed ? { justifyContent: 'center', padding: '8px 0' } : { gap: 8 }}
        >
          <Avatar name={userName} size={20} />
          {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</span>}
        </div>
        <div
          className="nav-item"
          onClick={onLogout}
          title="Sign out"
          style={collapsed ? { justifyContent: 'center', padding: '8px 0' } : undefined}
        >
          <span style={{ fontSize: 13 }}>⏻</span>
          {!collapsed && <span>Sign out</span>}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: collapsed ? 'center' : undefined, padding: collapsed ? 0 : '0 2px' }}>v1.0.0</div>
      </div>
    </div>
  );
}
