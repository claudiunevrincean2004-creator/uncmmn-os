'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DriveFolder, Client } from '@/lib/types';
import DriveModal from '@/components/modals/DriveModal';

interface Props {
  client: Client;
  driveFolders: DriveFolder[];
  onReload: () => void;
}

export default function DriveTab({ client, driveFolders, onReload }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editFolder, setEditFolder] = useState<DriveFolder | null>(null);

  async function deleteFolder(id: string) {
    if (!confirm('Delete this folder link?')) return;
    await supabase.from('drive_folders').delete().eq('id', id);
    onReload();
  }

  const clientFolders = driveFolders.filter(f => f.client_id === client.id);

  // Group by category
  const grouped: Record<string, DriveFolder[]> = {};
  clientFolders.forEach(f => {
    const cat = f.category || 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(f);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#555' }}>{clientFolders.length} folders linked</span>
        <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => { setEditFolder(null); setShowModal(true); }}>+ Add Folder</button>
      </div>

      {clientFolders.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>No Drive folders linked yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(grouped).map(([cat, folders]) => (
            <div key={cat}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#444', fontWeight: 600, marginBottom: 8, paddingBottom: 6, borderBottom: '0.5px solid #1a1a1a' }}>
                {cat}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {folders.map(folder => (
                  <div key={folder.id} className="card" style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 14 }}>📁</span>
                          <span style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                        </div>
                        {folder.url ? (
                          <a
                            href={folder.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 10, color: '#6366f1', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            Open in Drive →
                          </a>
                        ) : (
                          <span style={{ fontSize: 10, color: '#333' }}>No URL set</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 6 }}>
                        <button style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }} onClick={() => { setEditFolder(folder); setShowModal(true); }}>✎</button>
                        <button className="btn-danger" style={{ padding: '2px 4px' }} onClick={() => deleteFolder(folder.id)}>✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <DriveModal
          folder={editFolder}
          client={client}
          onClose={() => setShowModal(false)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}
