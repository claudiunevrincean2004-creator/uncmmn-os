'use client';
import { useState, useMemo } from 'react';
import { Client, ClientType, BillingType } from '@/lib/types';
import { fm } from '@/lib/utils';
import PlatformIcon from '@/components/PlatformIcon';

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

const CLIENT_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'DFY — Agency': { bg: '#3b82f622', text: '#3b82f6', border: '#3b82f6' },
  Consulting: { bg: '#8b5cf622', text: '#8b5cf6', border: '#8b5cf6' },
  Coaching: { bg: '#10b98122', text: '#10b981', border: '#10b981' },
  Partnership: { bg: '#f59e0b22', text: '#f59e0b', border: '#f59e0b' },
  Other: { bg: '#6b728022', text: '#6b7280', border: '#6b7280' },
};

const CLIENT_TYPE_OPTIONS: (ClientType | 'All')[] = ['All', 'DFY — Agency', 'Consulting', 'Coaching', 'Partnership', 'Other'];
const BILLING_TYPE_OPTIONS: (BillingType | 'All')[] = ['All', 'Retainer', 'One-time'];
const STATUS_OPTIONS = ['All', 'Active', 'Inactive', 'Paused'];

function getTypeColors(ct?: string) {
  return CLIENT_TYPE_COLORS[ct || ''] || CLIENT_TYPE_COLORS.Other;
}

export default function ClientsPage({ clients, onSelectClient, onAddClient }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [billingFilter, setBillingFilter] = useState<string>('All');

  const activeClients = clients.filter(c => c.status === 'Active');
  const highestPaying = activeClients.length > 0
    ? activeClients.reduce((max, c) => (c.retainer || 0) > (max.retainer || 0) ? c : max, activeClients[0])
    : null;
  const mrr = activeClients.filter(c => c.billing_type !== 'One-time').reduce((s, c) => s + (c.retainer || 0), 0);
  const avgRetainer = activeClients.length > 0 ? activeClients.reduce((s, c) => s + (c.retainer || 0), 0) / activeClients.length : 0;

  const filtered = useMemo(() => {
    return clients.filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'All' && (c.status || 'Active') !== statusFilter) return false;
      if (typeFilter !== 'All' && (c.client_type || '') !== typeFilter) return false;
      if (billingFilter !== 'All' && (c.billing_type || 'Retainer') !== billingFilter) return false;
      return true;
    });
  }, [clients, search, statusFilter, typeFilter, billingFilter]);

  function renderCard(client: Client) {
    const status = client.status || 'Active';
    const colors = STATUS_COLORS[status] || STATUS_COLORS.Active;
    const typeColors = getTypeColors(client.client_type);
    const isConsulting = client.client_type === 'Consulting';

    return (
      <div
        key={client.id}
        onClick={() => onSelectClient(client.id)}
        style={{
          background: '#111',
          border: '0.5px solid #1a1a1a',
          borderLeft: `3px solid ${typeColors.border}`,
          borderRadius: 10,
          padding: 18,
          cursor: 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#151515'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#111'; }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: '#1a1a1a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 700, color: '#555', flexShrink: 0,
            }}>
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{client.name}</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                  background: colors.bg, color: colors.text,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {status}
                </span>
                {client.client_type && (
                  <span style={{
                    fontSize: 8, fontWeight: 600, padding: '2px 5px', borderRadius: 3,
                    background: typeColors.bg, color: typeColors.text,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {client.client_type === 'DFY — Agency' ? 'DFY' : client.client_type}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Platforms */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
          {(client.platforms || []).map(p => (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4, border: '0.5px solid #2a2a2a' }}>
              <PlatformIcon platform={p} size={14} />
              <span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>{p}</span>
            </div>
          ))}
          {(!client.platforms || client.platforms.length === 0) && (
            <span style={{ fontSize: 10, color: '#333' }}>No platforms</span>
          )}
        </div>

        {/* Info row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, fontWeight: 600 }}>
              {isConsulting ? 'Fee per Call' : 'Retainer'}
            </div>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
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

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Active Clients</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>{activeClients.length}</div>
        </div>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>All Time Clients</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#6366f1' }}>{clients.length}</div>
        </div>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Highest Paying</div>
          {highestPaying ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{fm(highestPaying.retainer)}</div>
              <div style={{ fontSize: 10, color: '#555', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{highestPaying.name}</div>
            </>
          ) : (
            <div style={{ fontSize: 14, color: '#333' }}>—</div>
          )}
        </div>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Monthly Revenue</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>{fm(mrr)}</div>
        </div>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Avg Retainer</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{fm(avgRetainer)}</div>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: 12 }}>
        <input
          className="form-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients..."
          style={{ width: '100%', fontSize: 12, padding: '8px 12px' }}
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#444', fontWeight: 600, marginRight: 4 }}>Status:</span>
          {STATUS_OPTIONS.map(s => (
            <button key={s} className={`subtab${statusFilter === s ? ' active' : ''}`} onClick={() => setStatusFilter(s)} style={{ fontSize: 10, padding: '3px 8px' }}>
              {s}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#444', fontWeight: 600, marginRight: 4 }}>Type:</span>
          {CLIENT_TYPE_OPTIONS.map(ct => (
            <button key={ct} className={`subtab${typeFilter === ct ? ' active' : ''}`} onClick={() => setTypeFilter(ct)} style={{ fontSize: 10, padding: '3px 8px' }}>
              {ct === 'DFY — Agency' ? 'DFY' : ct}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#444', fontWeight: 600, marginRight: 4 }}>Billing:</span>
          {BILLING_TYPE_OPTIONS.map(bt => (
            <button key={bt} className={`subtab${billingFilter === bt ? ' active' : ''}`} onClick={() => setBillingFilter(bt)} style={{ fontSize: 10, padding: '3px 8px' }}>
              {bt}
            </button>
          ))}
        </div>
      </div>

      {/* Client grid */}
      {filtered.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {filtered.map(renderCard)}
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#333', padding: '60px 0', fontSize: 13 }}>
          {clients.length === 0 ? 'No clients yet. Click "+ Add Client" to get started.' : 'No clients match your filters.'}
        </div>
      )}
    </div>
  );
}
