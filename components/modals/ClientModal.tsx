'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, ClientType, BillingType } from '@/lib/types';
import PlatformIcon from '@/components/PlatformIcon';

interface Props {
  client?: Client | null;
  defaultStartDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

const PLATFORM_OPTIONS = ['Instagram', 'TikTok', 'YouTube'];
const CLIENT_TYPE_OPTIONS: ClientType[] = ['DFY — Agency', 'Consulting', 'Coaching', 'Partnership', 'Other'];
const BILLING_TYPE_OPTIONS: BillingType[] = ['Retainer', 'One-time'];

export default function ClientModal({ client, defaultStartDate, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [niche, setNiche] = useState('');
  const [retainer, setRetainer] = useState('');
  const [cost, setCost] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [status, setStatus] = useState<'Active' | 'Inactive' | 'Paused'>('Active');
  const [clientType, setClientType] = useState<ClientType>('DFY — Agency');
  const [billingType, setBillingType] = useState<BillingType>('Retainer');
  const [renewalDate, setRenewalDate] = useState('');
  const [startDate, setStartDate] = useState(defaultStartDate || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (client) {
      setName(client.name || '');
      setNiche(client.niche || '');
      setRetainer(String(client.retainer || ''));
      setCost(String(client.cost || ''));
      setPlatforms(client.platforms || []);
      setStatus(client.status || 'Active');
      setClientType(client.client_type || 'DFY — Agency');
      setBillingType(client.billing_type || 'Retainer');
      setRenewalDate(client.renewal_date || '');
      setStartDate(client.start_date || '');
    } else if (defaultStartDate) {
      setStartDate(defaultStartDate);
    }
  }, [client, defaultStartDate]);

  function handleClientTypeChange(ct: ClientType) {
    setClientType(ct);
    if (ct === 'Consulting') {
      setBillingType('One-time');
    }
  }

  function togglePlatform(p: string) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);

    const now = new Date().toISOString().split('T')[0];
    const data: Record<string, unknown> = {
      name: name.trim(),
      niche: niche.trim(),
      retainer: parseFloat(retainer) || 0,
      cost: parseFloat(cost) || 0,
      platforms,
      status,
      client_type: clientType,
      billing_type: billingType,
      renewal_date: renewalDate || null,
      start_date: startDate || null,
    };

    if (client?.id) {
      if (status === 'Inactive' && client.status !== 'Inactive') {
        data.inactive_date = now;
      } else if (status !== 'Inactive' && client.status === 'Inactive') {
        data.inactive_date = null;
      }
      await supabase.from('clients').update(data).eq('id', client.id);
    } else {
      if (status === 'Inactive') {
        data.inactive_date = now;
      }
      await supabase.from('clients').insert([data]);
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  const isConsulting = clientType === 'Consulting';
  const billingLocked = isConsulting;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{client ? 'Edit Client' : 'Add Client'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">Client Name *</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme Corp" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Client Type *</label>
              <select className="form-input" value={clientType} onChange={e => handleClientTypeChange(e.target.value as ClientType)}>
                {CLIENT_TYPE_OPTIONS.map(ct => (
                  <option key={ct} value={ct}>{ct}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Billing Type {billingLocked && <span style={{ fontSize: 9, color: '#555' }}>(locked)</span>}</label>
              <select
                className="form-input"
                value={billingType}
                onChange={e => setBillingType(e.target.value as BillingType)}
                disabled={billingLocked}
                style={billingLocked ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                {BILLING_TYPE_OPTIONS.map(bt => (
                  <option key={bt} value={bt}>{bt}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Status</label>
              <select className="form-input" value={status} onChange={e => setStatus(e.target.value as 'Active' | 'Inactive' | 'Paused')}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Paused">Paused</option>
              </select>
            </div>
            <div>
              <label className="form-label">Start Date *</label>
              <input className="form-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">{billingType === 'One-time' ? 'Fee ($)' : 'Monthly Retainer ($)'}</label>
              <input className="form-input" type="number" value={retainer} onChange={e => setRetainer(e.target.value)} placeholder="0" />
            </div>
            {billingType === 'Retainer' && (
              <div>
                <label className="form-label">Renewal Date</label>
                <input className="form-input" type="date" value={renewalDate} onChange={e => setRenewalDate(e.target.value)} />
              </div>
            )}
          </div>

          <div>
            <label className="form-label">Niche</label>
            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="e.g. Fitness, Tech, Food..." />
          </div>

          <div>
            <label className="form-label">Platforms</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {PLATFORM_OPTIONS.map(p => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: '0.5px solid',
                    borderColor: platforms.includes(p) ? '#fff' : '#2a2a2a',
                    background: platforms.includes(p) ? '#fff' : 'transparent',
                    color: platforms.includes(p) ? '#000' : '#555',
                    fontSize: 11,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <PlatformIcon platform={p} size={14} />
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Client'}
          </button>
        </div>
      </div>
    </div>
  );
}
