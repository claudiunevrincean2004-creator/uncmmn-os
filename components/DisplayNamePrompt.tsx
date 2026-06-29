'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// First-login, one-time prompt shown whenever the signed-in user has no
// display_name yet. Intentionally has no close/cancel — saving a name is the
// only way out, and once saved the parent stops rendering it. Applies to any
// user (admin or editor); writes via the self-service RPC.
export default function DisplayNamePrompt({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const { error } = await supabase.rpc('set_my_display_name', { new_name: trimmed });
    setSaving(false);
    if (error) {
      console.error('[DisplayNamePrompt] failed to set display name', error);
      alert(`Couldn't save your name: ${error.message}`);
      return;
    }
    onSaved();
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }}>
      <div className="modal-box" style={{ width: 380 }}>
        <div className="font-head" style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>What should we call you?</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>Set the name shown on your comments and across the workspace. You can change it later from your account.</div>
        <input
          autoFocus
          className="form-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your name"
          style={{ width: '100%', fontSize: 13, marginBottom: 14 }}
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
        />
        <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px', width: '100%' }} onClick={save} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
