'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';
import { useDismiss } from '@/lib/use-dismiss';
import { profileName } from './UserPicker';
import { InlineText } from './cells';

// Admin-only: set each user's display name and toggle whether they appear in
// the assignee picker (profiles.display_name / profiles.assignable).
export default function AssigneeSettings({
  profiles, onClose, onReload,
}: {
  profiles: Profile[];
  onClose: () => void;
  onReload: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  useDismiss(null, onClose, { outside: false });

  const sorted = [...profiles].sort((a, b) => profileName(a).localeCompare(profileName(b)));

  async function toggle(p: Profile) {
    if (busy) return;
    setBusy(p.id);
    await supabase.from('profiles').update({ assignable: p.assignable === false }).eq('id', p.id);
    setBusy(null);
    onReload();
  }

  async function saveName(p: Profile, value: string) {
    const next = value.trim();
    if (next === (p.display_name ?? '').trim()) return;
    await supabase.from('profiles').update({ display_name: next || null }).eq('id', p.id);
    onReload();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>Users</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>Set each user&rsquo;s display name (used on assignees and comments; falls back to their email name if blank). Only &ldquo;Assignable&rdquo; users appear in the &ldquo;Assigned to&rdquo; picker.</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sorted.map(p => {
            const on = p.assignable !== false;
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <InlineText value={p.display_name ?? ''} onCommit={v => saveName(p, v)} placeholder={profileName(p)} style={{ width: '100%', fontWeight: 600 }} />
                  {p.email && <div style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>}
                  {p.role && <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p.role}</div>}
                </div>
                <button
                  onClick={() => toggle(p)}
                  disabled={busy === p.id}
                  className={`badge ${on ? 'badge-up' : ''}`}
                  style={{ cursor: 'pointer', border: '1px solid var(--border)', padding: '4px 10px', color: on ? 'var(--pos)' : 'var(--text-faint)', flexShrink: 0 }}
                >
                  {on ? 'Assignable' : 'Hidden'}
                </button>
              </div>
            );
          })}
          {sorted.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>No users found.</div>}
        </div>
      </div>
    </div>
  );
}
