'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { DriveFolder, Client } from '@/lib/types';

interface Props {
  folder?: DriveFolder | null;
  client: Client;
  onClose: () => void;
  onSaved: () => void;
}

export default function DriveModal({ folder, client, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (folder) {
      setName(folder.name || '');
      setUrl(folder.url || '');
      setCategory(folder.category || '');
    }
  }, [folder]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const data = {
      client_id: client.id,
      name: name.trim(),
      url: url.trim(),
      category: category.trim(),
    };
    if (folder?.id) {
      await supabase.from('drive_folders').update(data).eq('id', folder.id);
    } else {
      await supabase.from('drive_folders').insert([data]);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{folder ? 'Edit Folder' : 'Add Drive Folder'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">Folder Name</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Raw Footage, Graphics, Final Edits..." />
          </div>
          <div>
            <label className="form-label">Google Drive URL</label>
            <input className="form-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
          </div>
          <div>
            <label className="form-label">Category</label>
            <input className="form-input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Assets, Deliverables, Archive..." />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Folder'}
          </button>
        </div>
      </div>
    </div>
  );
}
