'use client';
import { MainPage } from '@/lib/types';
import StarLogo from '@/components/StarLogo';

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
  { key: 'drive', label: 'Drive', icon: '▤' },
];

interface Props {
  activeMP: MainPage;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectMain: (page: MainPage) => void;
}

export default function Sidebar({ activeMP, collapsed, onToggleCollapse, onSelectMain }: Props) {
  const w = collapsed ? 56 : 210;

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
        {NAV.map(item => (
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

      <div style={{ padding: collapsed ? '10px 4px' : '10px 14px', borderTop: '0.5px solid var(--border)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: collapsed ? 'center' : undefined }}>v1.0.0</div>
      </div>
    </div>
  );
}
