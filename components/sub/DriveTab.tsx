'use client';
import { useMemo, useState } from 'react';
import { useDialogs } from '@/components/DialogProvider';
import Dropdown from './studio/Dropdown';
import { supabase } from '@/lib/supabase';
import { DriveFolder, Client } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import DriveModal from '@/components/modals/DriveModal';
import Icon from '@/components/Icon';

interface Props {
  client: Client;
  driveFolders: DriveFolder[];
  onReload: () => void;
}

type AssetView = 'grid' | 'list';

const UNCATEGORISED = 'General';

// A category keeps one colour everywhere it appears — the section dot, the
// folder tile, the card's hover edge — so the eye can group by hue alone. Known
// names get a deliberate colour; anything else gets a stable one from its own
// hash, so a new category is never uncoloured and never changes colour later.
const KNOWN_CATEGORY_COLORS: Record<string, string> = {
  content: '#6366f1',
  ads: '#14b8a6',
  brand: '#f59e0b',
  admin: '#3b82f6',
  general: '#8b5cf6',
  raw: '#ec4899',
  archive: '#6b7280',
};
const CATEGORY_PALETTE = ['#6366f1', '#14b8a6', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#ef4444'];

function categoryColor(category: string): string {
  const key = category.trim().toLowerCase();
  const known = KNOWN_CATEGORY_COLORS[key];
  if (known) return known;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length];
}

// Relative age of a folder LINK. NOTE: drive_folders has no updated_at — only
// created_at — so this is when the folder was linked here, never when its Drive
// contents last changed. It's labelled "Added" for exactly that reason.
function timeAgo(iso?: string): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export default function DriveTab({ client, driveFolders, onReload }: Props) {
  const { toastError, confirm: askConfirm } = useDialogs();
  const [showModal, setShowModal] = useState(false);
  const [editFolder, setEditFolder] = useState<DriveFolder | null>(null);
  const [view, setView] = usePersistedState<AssetView>('assets_view', 'grid');
  const [search, setSearch] = useState('');
  const [fCategory, setFCategory] = usePersistedState<string>('assets_category', 'All');

  async function deleteFolder(id: string) {
    if (!(await askConfirm('Delete this folder link?'))) return;
    await supabase.from('drive_folders').delete().eq('id', id);
    onReload();
  }

  const clientFolders = useMemo(
    () => driveFolders.filter(f => f.client_id === client.id),
    [driveFolders, client.id],
  );

  // Every category actually in use, for the filter dropdown.
  const categories = useMemo(
    () => Array.from(new Set(clientFolders.map(f => f.category || UNCATEGORISED))).sort(),
    [clientFolders],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clientFolders.filter(f => {
      const cat = f.category || UNCATEGORISED;
      if (fCategory !== 'All' && cat !== fCategory) return false;
      if (q && !f.name.toLowerCase().includes(q) && !cat.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clientFolders, search, fCategory]);

  // Grouped by category, categories in alphabetical order so the page doesn't
  // reshuffle as folders are added.
  const groups = useMemo(() => {
    const map = new Map<string, DriveFolder[]>();
    for (const f of filtered) {
      const cat = f.category || UNCATEGORISED;
      const list = map.get(cat);
      if (list) list.push(f); else map.set(cat, [f]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  function openEdit(folder: DriveFolder) {
    setEditFolder(folder);
    setShowModal(true);
  }

  // Edit / remove, shared by the card and the row.
  function RowActions({ folder }: { folder: DriveFolder }) {
    return (
      <div className="asset-actions">
        <button className="asset-action" onClick={() => openEdit(folder)} title="Edit folder link" aria-label="Edit folder link">✎</button>
        <button className="asset-action is-danger" onClick={() => deleteFolder(folder.id)} title="Remove folder link" aria-label="Remove folder link">✕</button>
      </div>
    );
  }

  return (
    <div>
      <div className="assets-count">
        <strong>{clientFolders.length}</strong> folder{clientFolders.length === 1 ? '' : 's'} linked
      </div>

      {/* Filter row — search · category · view, with Add holding the right edge.
          One flex context, so the controls share a line and shrink together
          instead of stacking. */}
      <div className="assets-toolbar">
        <div className="studio-search">
          <span className="studio-search-icon" aria-hidden>⌕</span>
          <input
            className="form-input"
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search folders…"
            aria-label="Search folders"
          />
        </div>

        <Dropdown
          variant="input"
          className="assets-select"
          value={fCategory}
          options={[{ value: 'All', label: 'All categories' }, ...categories.map(c => ({ value: c, label: c }))]}
          onChange={setFCategory}
          ariaLabel="Filter by category"
        />

        <div className="view-seg" role="group" aria-label="View">
          <button
            type="button"
            className={view === 'grid' ? 'active' : undefined}
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
            title="Grid view"
          >
            <Icon name="grid" size={14} />Grid
          </button>
          <button
            type="button"
            className={view === 'list' ? 'active' : undefined}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
            title="List view"
          >
            <Icon name="list" size={14} />List
          </button>
        </div>

        {/* Pushed to the right edge of the row. */}
        <button
          className="btn-primary assets-add"
          onClick={() => { setEditFolder(null); setShowModal(true); }}
        >
          <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>+</span>Add Folder
        </button>
      </div>

      {clientFolders.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No Drive folders linked yet.</div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No folders match. Adjust the search or category filter.</div>
      ) : (
        <div className="assets-groups">
          {groups.map(([cat, folders]) => {
            const color = categoryColor(cat);
            return (
              <section key={cat} className="asset-group" style={{ '--cat-color': color } as React.CSSProperties}>
                <div className="asset-group-head">
                  <span className="asset-group-dot" />
                  <span className="asset-group-name">{cat}</span>
                  <span className="asset-group-count">{folders.length}</span>
                  <span className="asset-group-rule" aria-hidden />
                </div>

                {view === 'grid' ? (
                  <div className="asset-grid">
                    {folders.map(f => {
                      const added = timeAgo(f.created_at);
                      return (
                        <div key={f.id} className="asset-card">
                          <div className="asset-card-head">
                            <span className="asset-icon"><Icon name="folder" size={18} /></span>
                            <div className="asset-id">
                              <div className="asset-name" title={f.name}>{f.name}</div>
                              <div className="asset-sub">{cat} · Google Drive</div>
                            </div>
                            <RowActions folder={f} />
                          </div>
                          <div className="asset-card-foot">
                            {/* created_at, not an updated_at — see timeAgo(). */}
                            <span className="asset-time">{added ? `Added ${added}` : ''}</span>
                            {f.url
                              ? <a className="asset-open link-anim" href={f.url} target="_blank" rel="noopener noreferrer">Open in Drive <span aria-hidden>→</span></a>
                              : <span className="asset-nourl">No URL set</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="asset-list">
                    {folders.map(f => {
                      const added = timeAgo(f.created_at);
                      return (
                        <div key={f.id} className="asset-row">
                          <span className="asset-icon"><Icon name="folder" size={17} /></span>
                          <div className="asset-id">
                            <div className="asset-name" title={f.name}>{f.name}</div>
                            <div className="asset-sub">{cat} · Google Drive</div>
                          </div>
                          <span className="asset-time">{added ?? ''}</span>
                          {f.url
                            ? <a className="asset-open link-anim" href={f.url} target="_blank" rel="noopener noreferrer">Open <span aria-hidden>↗</span></a>
                            : <span className="asset-nourl">No URL</span>}
                          <RowActions folder={f} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
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
