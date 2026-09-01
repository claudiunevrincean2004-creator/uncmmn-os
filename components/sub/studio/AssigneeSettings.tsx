'use client';
import { useState } from 'react';
import { useDialogs } from '@/components/DialogProvider';
import Dropdown from './Dropdown';
import { supabase } from '@/lib/supabase';
import { Profile, ClipperAccount } from '@/lib/types';
import { useDismiss } from '@/lib/use-dismiss';
import { profileName } from './UserPicker';

// Admin-only: view every user, edit a user's display name / job title / role /
// Slack id (behind an explicit Edit toggle — no inline editing), and remove
// users. The legacy `assignable` flag is no longer used — everyone is assignable.
export default function AssigneeSettings({
  profiles, clipperAccounts = [], currentUserId, onClose, onReload,
}: {
  profiles: Profile[];
  clipperAccounts?: ClipperAccount[];
  currentUserId?: string | null;
  onClose: () => void;
  onReload: () => void;
}) {
  const { toastError, confirm: askConfirm } = useDialogs();
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editSlack, setEditSlack] = useState('');
  const [editRole, setEditRole] = useState<string>('editor');
  const [editClipperStatus, setEditClipperStatus] = useState<string>('active');
  useDismiss(null, onClose, { outside: false });

  const sorted = [...profiles].sort((a, b) => profileName(a).localeCompare(profileName(b)));
  const accountCount = (id: string) => clipperAccounts.filter(a => a.clipper_id === id).length;

  function startEdit(p: Profile) {
    setEditName(p.display_name ?? '');
    setEditTitle(p.job_title ?? '');
    setEditSlack(p.slack_user_id ?? '');
    setEditRole(p.role === 'admin' || p.role === 'clipper' ? p.role : 'editor');
    setEditClipperStatus(p.clipper_status === 'inactive' ? 'inactive' : 'active');
    setEditingId(p.id);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(p: Profile) {
    if (busy) return;
    setBusy(p.id);
    // Admins may update any profile (profiles_admin_update policy). clipper_status
    // only applies to the clipper tier; harmless to set otherwise.
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: editName.trim() || null,
        job_title: editTitle.trim() || null,
        slack_user_id: editSlack.trim() || null,
        role: editRole,
        clipper_status: editRole === 'clipper' ? editClipperStatus : p.clipper_status ?? null,
      })
      .eq('id', p.id);
    setBusy(null);
    if (error) {
      console.error('[AssigneeSettings] failed to save user', error);
      toastError(`Couldn't save changes: ${error.message || 'Unknown error'}`);
      return;
    }
    setEditingId(null);
    onReload();
  }

  async function removeUser(p: Profile) {
    if (busy) return;
    if (!(await askConfirm(`Are you sure you want to remove ${profileName(p)}? This can't be undone.`))) return;
    setBusy(p.id);
    // Deletes auth user + profile (cascade); the function enforces admin-only and
    // blocks self-deletion server-side too.
    const { error } = await supabase.rpc('admin_delete_user', { target_id: p.id });
    setBusy(null);
    if (error) {
      console.error('[AssigneeSettings] failed to remove user', error);
      toastError(`Couldn't remove user: ${error.message || 'Unknown error'}`);
      return;
    }
    onReload();
  }

  const labelStyle: React.CSSProperties = { fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>Users</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>Edit a user&rsquo;s display name and job title, or remove a user. Names are shown on assignees and comments (falling back to their email name when blank).</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map(p => {
            const isEditing = editingId === p.id;
            const isSelf = p.id === currentUserId;
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: isEditing ? 'flex-start' : 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: isEditing ? 8 : 3 }}>
                  {isEditing ? (
                    <>
                      <div>
                        <div style={labelStyle}>Display name</div>
                        <input
                          autoFocus
                          className="form-input"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder={profileName(p)}
                          style={{ width: '100%', fontSize: 13, fontWeight: 600, marginTop: 3 }}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(p); else if (e.key === 'Escape') cancelEdit(); }}
                        />
                      </div>
                      <div>
                        <div style={labelStyle}>Job title</div>
                        <input
                          className="form-input"
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          placeholder="e.g. Media Buyer, Editor, Creator"
                          style={{ width: '100%', fontSize: 12, marginTop: 3 }}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(p); else if (e.key === 'Escape') cancelEdit(); }}
                        />
                      </div>
                      <div>
                        <div style={labelStyle}>Slack member ID</div>
                        <input
                          className="form-input"
                          value={editSlack}
                          onChange={e => setEditSlack(e.target.value)}
                          placeholder="e.g. U01ABCDE23"
                          style={{ width: '100%', fontSize: 12, marginTop: 3 }}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(p); else if (e.key === 'Escape') cancelEdit(); }}
                        />
                      </div>
                      <div>
                        <div style={labelStyle}>Role</div>
                        <Dropdown
                          variant="input"
                          value={editRole}
                          options={[
                            { value: 'admin', label: 'Admin' },
                            { value: 'editor', label: 'Editor' },
                            { value: 'clipper', label: 'Clipper' },
                          ]}
                          onChange={setEditRole}
                          ariaLabel="Role"
                          width="100%"
                          style={{ marginTop: 3 }}
                        />
                      </div>
                      {editRole === 'clipper' && (
                        <div>
                          <div style={labelStyle}>Clipper status</div>
                          <Dropdown
                            variant="input"
                            value={editClipperStatus}
                            options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
                            onChange={setEditClipperStatus}
                            ariaLabel="Clipper status"
                            width="100%"
                            style={{ marginTop: 3 }}
                          />
                        </div>
                      )}
                      {p.email && <div style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileName(p)}</div>
                      {p.job_title && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{p.job_title}</div>}
                      {p.email && <div style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>}
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Slack ID: {p.slack_user_id?.trim() || <span style={{ color: 'var(--text-faint)' }}>not set</span>}</div>
                      {p.role && (
                        <div style={{ fontSize: 10, color: p.role === 'clipper' ? '#8b5cf6' : 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: p.role === 'clipper' ? 700 : 400 }}>
                          {p.role}
                          {p.role === 'clipper' && <> · {p.clipper_status === 'inactive' ? 'inactive' : 'active'} · {accountCount(p.id)} acct{accountCount(p.id) === 1 ? '' : 's'}</>}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {isEditing ? (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn-primary" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => saveEdit(p)} disabled={busy === p.id}>{busy === p.id ? '…' : 'Save'}</button>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 12px' }} onClick={cancelEdit} disabled={busy === p.id}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => startEdit(p)} disabled={!!editingId}>Edit</button>
                    {isSelf ? (
                      <span style={{ fontSize: 10, color: 'var(--text-faint)', width: 56, textAlign: 'center' }} title="You can't remove your own account">You</span>
                    ) : (
                      <button className="btn-danger" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => removeUser(p)} disabled={busy === p.id || !!editingId} title={`Remove ${profileName(p)}`}>
                        {busy === p.id ? '…' : 'Remove'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {sorted.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>No users found.</div>}
        </div>
      </div>
    </div>
  );
}
