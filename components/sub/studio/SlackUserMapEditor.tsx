'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SlackUserMap } from '@/lib/types';
import { useDismiss } from '@/lib/use-dismiss';

// Small, unobtrusive editor for the slack_user_map table (person_name ->
// slack_user_id). Lets anyone paste/edit a Slack ID and add new people inline so
// the Ad Creative pings (#ad-creative-pipeline) can @-mention the right person —
// no SQL required. A Slack member ID looks like "U01ABCDE23".
export default function SlackUserMapEditor({
  rows, onClose, onReload,
}: {
  rows: SlackUserMap[];
  onClose: () => void;
  onReload: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newId, setNewId] = useState('');
  useDismiss(null, onClose, { outside: false });

  const sorted = [...rows].sort((a, b) => (a.person_name || '').localeCompare(b.person_name || ''));

  async function patch(id: string, p: Partial<SlackUserMap>) {
    setBusy(id);
    const { error } = await supabase.from('slack_user_map').update(p).eq('id', id);
    setBusy(null);
    if (error) {
      console.error('[SlackUserMapEditor] failed to save', error);
      alert(`Couldn't save: ${error.message}`);
      return;
    }
    onReload();
  }

  async function addPerson() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy('new');
    const { error } = await supabase.from('slack_user_map').insert([{ person_name: name, slack_user_id: newId.trim() || null }]);
    setBusy(null);
    if (error) {
      console.error('[SlackUserMapEditor] failed to add person', error);
      alert(`Couldn't add person: ${error.message}`);
      return;
    }
    setNewName('');
    setNewId('');
    onReload();
  }

  async function removePerson(r: SlackUserMap) {
    if (busy) return;
    if (!confirm(`Remove ${r.person_name} from the Slack map?`)) return;
    setBusy(r.id);
    const { error } = await supabase.from('slack_user_map').delete().eq('id', r.id);
    setBusy(null);
    if (error) {
      console.error('[SlackUserMapEditor] failed to remove', error);
      alert(`Couldn't remove: ${error.message}`);
      return;
    }
    onReload();
  }

  const labelStyle: React.CSSProperties = { fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 3 };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>Team Slack IDs</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
          Map each person to their Slack member ID (looks like <code style={{ fontSize: 11 }}>U01ABCDE23</code>) so Ad Creative pings can @-mention them. Names must match the assignee / reviewer names used in the pipeline (e.g. Claudiu, Colin).
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={labelStyle}>Name</div>
                <input
                  className="form-input"
                  defaultValue={r.person_name}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== r.person_name) patch(r.id, { person_name: v }); }}
                  style={{ width: '100%', fontSize: 12, fontWeight: 600 }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={labelStyle}>Slack ID</div>
                <input
                  className="form-input"
                  defaultValue={r.slack_user_id ?? ''}
                  placeholder="U01ABCDE23"
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (r.slack_user_id ?? '')) patch(r.id, { slack_user_id: v || null }); }}
                  style={{ width: '100%', fontSize: 12 }}
                />
              </div>
              <button className="btn-danger" style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }} onClick={() => removePerson(r)} disabled={busy === r.id} title={`Remove ${r.person_name}`}>
                {busy === r.id ? '…' : '✕'}
              </button>
            </div>
          ))}
          {sorted.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>No people mapped yet. Add one below.</div>}
        </div>

        {/* Add new */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={labelStyle}>Name</div>
            <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Badr" style={{ width: '100%', fontSize: 12 }} onKeyDown={e => { if (e.key === 'Enter') addPerson(); }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={labelStyle}>Slack ID</div>
            <input className="form-input" value={newId} onChange={e => setNewId(e.target.value)} placeholder="U01ABCDE23 (optional)" style={{ width: '100%', fontSize: 12 }} onKeyDown={e => { if (e.key === 'Enter') addPerson(); }} />
          </div>
          <button className="btn-primary" style={{ fontSize: 11, padding: '6px 12px', flexShrink: 0 }} onClick={addPerson} disabled={!newName.trim() || busy === 'new'}>
            {busy === 'new' ? '…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
