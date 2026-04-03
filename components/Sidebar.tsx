'use client';
import { Client } from '@/lib/types';
import { getPlatformColor } from '@/lib/utils';

interface Props {
  clients: Client[];
  activeId: string | null;
  activeMP: string;
  onSelectMain: (page: string) => void;
  onSelectClient: (id: string) => void;
  onAddClient: () => void;
}

export default function Sidebar({ clients, activeId, activeMP, onSelectMain, onSelectClient, onAddClient }: Props) {
  return (
    <div style={{
      width: 210,
      minWidth: 210,
      background: '#000',
      borderRight: '0.5px solid #1a1a1a',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding: '18px 14px 14px', borderBottom: '0.5px solid #111' }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 }}>UNCMMN</div>
        <div style={{ fontSize: 9, color: '#333', marginTop: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Agency OS</div>
      </div>

      {/* Main nav */}
      <div style={{ padding: '10px 8px', borderBottom: '0.5px solid #111' }}>
        <div
          className={`nav-item${activeMP === 'overview' && !activeId ? ' active' : ''}`}
          onClick={() => onSelectMain('overview')}
        >
          <span style={{ fontSize: 13 }}>◎</span>
          <span>Overview</span>
        </div>
        <div
          className={`nav-item${activeMP === 'finance' ? ' active' : ''}`}
          onClick={() => onSelectMain('finance')}
        >
          <span style={{ fontSize: 13 }}>$</span>
          <span>Finance</span>
        </div>
      </div>

      {/* Clients */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
        <div style={{ fontSize: 9, color: '#333', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, padding: '4px 10px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Clients</span>
          <button
            onClick={onAddClient}
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
            title="Add client"
          >
            +
          </button>
        </div>
        {clients.length === 0 && (
          <div style={{ fontSize: 11, color: '#333', padding: '6px 10px' }}>No clients yet</div>
        )}
        {clients.map(client => (
          <div
            key={client.id}
            className={`nav-item${activeId === client.id ? ' active' : ''}`}
            onClick={() => onSelectClient(client.id)}
            title={client.name}
          >
            <div style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              background: activeId === client.id ? '#111' : '#111',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: activeId === client.id ? '#000' : '#666',
              flexShrink: 0,
            }}>
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 12,
              }}>
                {client.name}
              </div>
              {client.platforms?.length > 0 && (
                <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                  {client.platforms.slice(0, 3).map(p => (
                    <span
                      key={p}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: getPlatformColor(p),
                        display: 'inline-block',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 14px', borderTop: '0.5px solid #111' }}>
        <div style={{ fontSize: 10, color: '#222' }}>v1.0.0</div>
      </div>
    </div>
  );
}
