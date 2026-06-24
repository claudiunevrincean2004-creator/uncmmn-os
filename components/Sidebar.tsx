'use client';
import { MainPage } from '@/lib/types';

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
  { key: 'goals', label: 'Goals', icon: '◉' },
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
      background: '#000',
      borderRight: '0.5px solid #1a1a1a',
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
          background: '#111',
          border: '0.5px solid #2a2a2a',
          color: '#666',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          zIndex: 10,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#1a1a1a'; e.currentTarget.style.color = '#fff'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#111'; e.currentTarget.style.color = '#666'; }}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '›' : '‹'}
      </button>

      <div style={{ padding: collapsed ? '18px 8px 14px' : '18px 14px 14px', borderBottom: '0.5px solid #111', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {collapsed ? (
          <div style={{ fontSize: 16, fontWeight: 800, textAlign: 'center', letterSpacing: '-0.5px', lineHeight: 1 }}>N</div>
        ) : (
          <>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 }}>NATHAN</div>
            <div style={{ fontSize: 9, color: '#333', marginTop: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>OS</div>
          </>
        )}
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

      <div style={{ padding: collapsed ? '10px 4px' : '10px 14px', borderTop: '0.5px solid #111' }}>
        <div style={{ fontSize: 10, color: '#222', textAlign: collapsed ? 'center' : undefined }}>v1.0.0</div>
      </div>
    </div>
  );
}
