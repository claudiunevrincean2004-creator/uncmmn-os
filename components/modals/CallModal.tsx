'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ConsultingCall } from '@/lib/types';

interface Props {
  call?: ConsultingCall | null;
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function CallModal({ call, clientId, onClose, onSaved }: Props) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [duration, setDuration] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (call) {
      setDate(call.date || new Date().toISOString().split('T')[0]);
      setDuration(String(call.duration_minutes || ''));
      setAmount(String(call.amount || ''));
      setNotes(call.notes || '');
    }
  }, [call]);

  async function handleSave() {
    setSaving(true);
    const data = {
      client_id: clientId,
      date: date || null,
      duration_minutes: parseInt(duration) || 0,
      amount: parseFloat(amount) || 0,
      notes: notes.trim(),
    };
    if (call?.id) {
      await supabase.from('consulting_calls').update(data).eq('id', call.id);
    } else {
      await supabase.from('consulting_calls').insert([data]);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{call ? 'Edit Call' : 'Log Call'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Duration (minutes)</label>
              <input className="form-input" type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="60" />
            </div>
          </div>
          <div>
            <label className="form-label">Amount Paid ($)</label>
            <input className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="form-label">Notes / Summary</label>
            <textarea
              className="form-input"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Key topics discussed, action items..."
              style={{ minHeight: 100, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Call'}
          </button>
        </div>
      </div>
    </div>
  );
}
