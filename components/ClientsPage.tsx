'use client';
import { Client } from '@/lib/types';
import { fm, getPlatformColor } from '@/lib/utils';

interface Props {
  clients: Client[];
  onSelectClient: (id: string) => void;
  onAddClient: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Active: { bg: '#10b98122', text: '#10b981' },
  Inactive: { bg: '#ef444422', text: '#ef4444' },
  Paused: { bg: '#f59e0b22', text: '#f59e0b' },
};

export default function ClientsPage({ clients, onSelectClient, onAddClient }: Props) {
  const activeClients = clients.filter(c => c.status === 'Active');
  const otherClients = clients.filter(c => c.status !== 'Active');

  function renderCard(client: Client) {
    const status = client.status || 'Active';
    const colors = STATUS_COLORS[status] || STATUS_COLORS.Active;

    return (
      <div
        key={client.id}
        onClick={() => onSelectClient(client.id)}
        style={{
          background: '#111',
          border: '0.5px solid #1a1a1a',
          borderRadius: 10,
          padding: 18,
          cursor: 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.background = '#151515'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a1a1a'; e.currentTarget.style.background = '#111'; }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: '#1a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              fontWeight: 700,
              color: '#555',
              flexShrink: 0,
            }}>
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{client.name}</div>
              <span style={{
                fontSize: 9,
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 4,
                background: colors.bg,
                color: colors.text,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {status}
              </span>
            </div>
          </div>
        </div>

        {/* Platforms */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
          {(client.platforms || []).map(p => (
            <span key={p} style={{
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 4,
              border: '0.5px solid #2a2a2a',
              color: getPlatformColor(p),
              fontWeight: 600,
            }}>
              {p}
            </span>
          ))}
          {(!client.platforms || client.platforms.length === 0) && (
            <span style={{ fontSize: 10, color: '#333' }}>No platforms</span>
          )}
        </div>

        {/* Info row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, fontWeight: 600 }}>Retainer</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#10b981' }}>{fm(client.retainer)}</div>
          </div>
          {client.start_date && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, fontWeight: 600 }}>Start Date</div>
              <div style={{ fontSize: 12, color: '#555' }}>
                {new Date(client.start_date).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Clients</div>
          <div style={{ fontSize: 12, color: '#444' }}>{clients.length} total — {activeClients.length} active</div>
        </div>
        <button
          className="btn-primary"
          style={{ fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={onAddClient}
        >
          + Add Client
        </button>
      </div>

      {/* Active clients */}
      {activeClients.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 10 }}>
            Active ({activeClients.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, marginBottom: 20 }}>
            {activeClients.map(renderCard)}
          </div>
        </>
      )}

      {/* Other clients */}
      {otherClients.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 10 }}>
            Inactive / Paused ({otherClients.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {otherClients.map(renderCard)}
          </div>
        </>
      )}

      {clients.length === 0 && (
        <div style={{ textAlign: 'center', color: '#333', padding: '60px 0', fontSize: 13 }}>
          No clients yet. Click "+ Add Client" to get started.
        </div>
      )}
    </div>
  );
}
