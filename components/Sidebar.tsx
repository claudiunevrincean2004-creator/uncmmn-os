'use client';

interface Props {
  activeMP: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectMain: (page: string) => void;
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
      {/* Toggle button */}
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

      {/* Logo */}
      <div style={{ padding: collapsed ? '18px 8px 14px' : '18px 14px 14px', borderBottom: '0.5px solid #111', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {collapsed ? (
          <div style={{ fontSize: 16, fontWeight: 800, textAlign: 'center', letterSpacing: '-0.5px', lineHeight: 1 }}>U</div>
        ) : (
          <>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 }}>UNCMMN</div>
            <div style={{ fontSize: 9, color: '#333', marginTop: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Agency OS</div>
          </>
        )}
      </div>

      {/* Main nav */}
      <div style={{ padding: collapsed ? '10px 4px' : '10px 8px', flex: 1 }}>
        <div
          className={`nav-item${activeMP === 'overview' ? ' active' : ''}`}
          onClick={() => onSelectMain('overview')}
          title="Overview"
          style={collapsed ? { justifyContent: 'center', padding: '8px 0' } : undefined}
        >
          <span style={{ fontSize: 13 }}>◎</span>
          {!collapsed && <span>Overview</span>}
        </div>
        <div
          className={`nav-item${activeMP === 'finance' ? ' active' : ''}`}
          onClick={() => onSelectMain('finance')}
          title="Finance"
          style={collapsed ? { justifyContent: 'center', padding: '8px 0' } : undefined}
        >
          <span style={{ fontSize: 13 }}>$</span>
          {!collapsed && <span>Finance</span>}
        </div>
        <div
          className={`nav-item${activeMP === 'clients' ? ' active' : ''}`}
          onClick={() => onSelectMain('clients')}
          title="Clients"
          style={collapsed ? { justifyContent: 'center', padding: '8px 0' } : undefined}
        >
          <span style={{ fontSize: 13 }}>☷</span>
          {!collapsed && <span>Clients</span>}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: collapsed ? '10px 4px' : '10px 14px', borderTop: '0.5px solid #111' }}>
        <div style={{ fontSize: 10, color: '#222', textAlign: collapsed ? 'center' : undefined }}>v1.0.0</div>
      </div>
    </div>
  );
}
