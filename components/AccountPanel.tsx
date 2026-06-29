'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';
import { useDismiss } from '@/lib/use-dismiss';
import { profileName } from '@/lib/profile-name';
import Avatar from '@/components/Avatar';

// The current user's account panel (opened from the sidebar). Shows their avatar,
// email (read-only login), role badge (read-only), and lets them edit their own
// display name + job title via the self-service RPCs. Admins get a button to
// open full user management.
export default function AccountPanel({
  profile, email, isAdmin, onClose, onSaved, onManageUsers,
}: {
  profile: Profile;
  // The authenticated session email — authoritative login address, used when the
  // profiles row's email column isn't populated.
  email?: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
  onManageUsers: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.display_name ?? '');
  const [jobTitle, setJobTitle] = useState(profile.job_title ?? '');
  const [saving, setSaving] = useState(false);
  useDismiss(null, onClose, { outside: false });

  const nameChanged = name.trim() !== (profile.display_name ?? '').trim();
  const titleChanged = jobTitle.trim() !== (profile.job_title ?? '').trim();
  const changed = nameChanged || titleChanged;
  const roleLabel = profile.role === 'admin' ? 'Admin' : 'Editor';
  const loginEmail = profile.email || email || '';

  function startEdit() {
    setName(profile.display_name ?? '');
    setJobTitle(profile.job_title ?? '');
    setEditing(true);
  }

  function cancel() {
    setName(profile.display_name ?? '');
    setJobTitle(profile.job_title ?? '');
    setEditing(false);
  }

  async function save() {
    if (saving || !changed) { setEditing(false); return; }
    setSaving(true);
    // Each field has its own caller-scoped RPC; stop at the first failure.
    let error: { message?: string } | null = null;
    if (nameChanged) ({ error } = await supabase.rpc('set_my_display_name', { new_name: name.trim() }));
    if (!error && titleChanged) ({ error } = await supabase.rpc('set_my_job_title', { new_title: jobTitle.trim() }));
    setSaving(false);
    if (error) {
      // PostgrestError is a plain object with `.message` — read it so the user
      // sees a real reason (e.g. a missing function) instead of "[object Object]".
      console.error('[AccountPanel] failed to save profile', error);
      alert(`Couldn't save your changes: ${error.message || 'Unknown error'}`);
      return;
    }
    setEditing(false);
    onSaved();
  }

  const labelStyle: React.CSSProperties = { fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 6 };
  const valueStyle: React.CSSProperties = { fontSize: 13, color: 'var(--text)', marginBottom: 14 };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>Your account</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Identity header: avatar + name + role badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Avatar name={profileName(profile)} size={46} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileName(profile)}</div>
            <span
              style={{
                display: 'inline-block', marginTop: 4, fontSize: 9, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.05em',
                padding: '2px 8px', borderRadius: 20,
                background: profile.role === 'admin' ? 'rgba(139,92,246,0.16)' : 'var(--surface-2)',
                color: profile.role === 'admin' ? '#8b5cf6' : 'var(--text-faint)',
                border: '0.5px solid var(--border)',
              }}
            >
              {roleLabel}
            </span>
          </div>
        </div>

        {/* Email — read-only login */}
        <div style={labelStyle}>Email</div>
        <div
          style={{
            width: '100%', fontSize: 13, padding: '7px 9px', marginBottom: 14,
            background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 8,
            color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          title={loginEmail}
        >
          {loginEmail || '—'}
        </div>

        {/* Display name + Job title — read-only by default, editable via Edit */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ ...labelStyle, marginBottom: 0 }}>Profile</div>
          {!editing && (
            <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 12px' }} onClick={startEdit}>Edit</button>
          )}
        </div>

        {editing ? (
          <>
            <div style={labelStyle}>Display name</div>
            <input
              autoFocus
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={profileName(profile)}
              style={{ width: '100%', fontSize: 13, marginBottom: 14 }}
              onKeyDown={e => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') cancel(); }}
            />
            <div style={labelStyle}>Job title</div>
            <input
              className="form-input"
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
              placeholder="e.g. Media Buyer, Editor, Creator"
              style={{ width: '100%', fontSize: 13, marginBottom: 14 }}
              onKeyDown={e => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') cancel(); }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }} onClick={cancel} disabled={saving}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div style={labelStyle}>Display name</div>
            <div style={valueStyle}>{profile.display_name?.trim() || <span style={{ color: 'var(--text-faint)' }}>—</span>}</div>
            <div style={labelStyle}>Job title</div>
            <div style={valueStyle}>{profile.job_title?.trim() || <span style={{ color: 'var(--text-faint)' }}>—</span>}</div>
          </>
        )}

        {isAdmin && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Admin</div>
            <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px', width: '100%' }} onClick={onManageUsers}>Manage all users</button>
          </div>
        )}
      </div>
    </div>
  );
}
