'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';
import { useDismiss } from '@/lib/use-dismiss';
import { profileName } from '@/lib/profile-name';

// The current user's account panel (opened from the sidebar). Lets them view and
// change their own display name anytime via the self-service RPC. Admins get a
// button to open full user management (display names + assignable).
export default function AccountPanel({
  profile, isAdmin, onClose, onSaved, onManageUsers,
}: {
  profile: Profile;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
  onManageUsers: () => void;
}) {
  const [name, setName] = useState(profile.display_name ?? '');
  const [saving, setSaving] = useState(false);
  useDismiss(null, onClose, { outside: false });

  const changed = name.trim() !== (profile.display_name ?? '').trim();

  async function save() {
    if (saving || !changed) return;
    setSaving(true);
    const { error } = await supabase.rpc('set_my_display_name', { new_name: name.trim() });
    setSaving(false);
    if (error) {
      console.error('[AccountPanel] failed to save display name', error);
      alert(`Couldn't save your name: ${error.message}`);
      return;
    }
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>Your account</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 6 }}>Display name</div>
        <input
          autoFocus
          className="form-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={profileName(profile)}
          style={{ width: '100%', fontSize: 13, marginBottom: 6 }}
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
        />
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 14 }}>Shown on your comments and across the workspace.{profile.email ? ` Signed in as ${profile.email}.` : ''}</div>

        <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px', width: '100%' }} onClick={save} disabled={saving || !changed || !name.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </button>

        {isAdmin && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 8 }}>Admin</div>
            <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px', width: '100%' }} onClick={onManageUsers}>Manage all users</button>
          </div>
        )}
      </div>
    </div>
  );
}
