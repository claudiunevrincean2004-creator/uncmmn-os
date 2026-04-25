'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, ProjectTask, ProjectNote, ProjectStatus, PaymentStatus, ProjectTaskStatus } from '@/lib/types';
import { fm } from '@/lib/utils';

interface Props {
  client: Client;
  tasks: ProjectTask[];
  notes: ProjectNote[];
  onReload: () => void;
}

const PROJECT_STATUSES: ProjectStatus[] = ['Planning', 'In Progress', 'In Review', 'Completed'];
const PAYMENT_STATUSES: PaymentStatus[] = ['Unpaid', 'Deposit Paid', 'Paid in Full'];
const TASK_STATUSES: ProjectTaskStatus[] = ['todo', 'inprogress', 'done'];

const PROJECT_STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string }> = {
  Planning: { bg: '#6b728022', text: '#9ca3af' },
  'In Progress': { bg: '#3b82f622', text: '#3b82f6' },
  'In Review': { bg: '#f59e0b22', text: '#f59e0b' },
  Completed: { bg: '#10b98122', text: '#10b981' },
};

const PAYMENT_STATUS_COLORS: Record<PaymentStatus, { bg: string; text: string }> = {
  Unpaid: { bg: '#ef444422', text: '#ef4444' },
  'Deposit Paid': { bg: '#f59e0b22', text: '#f59e0b' },
  'Paid in Full': { bg: '#10b98122', text: '#10b981' },
};

const TASK_STATUS_LABELS: Record<ProjectTaskStatus, string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  done: 'Done',
};

const TASK_STATUS_COLORS: Record<ProjectTaskStatus, { bg: string; text: string }> = {
  todo: { bg: '#6b728022', text: '#9ca3af' },
  inprogress: { bg: '#3b82f622', text: '#3b82f6' },
  done: { bg: '#10b98122', text: '#10b981' },
};

function formatDate(date?: string): string {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function OneOffProjectDashboard({ client, tasks, notes, onReload }: Props) {
  const clientTasks = tasks
    .filter(t => t.client_id === client.id)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

  const clientNotes = notes
    .filter(n => n.client_id === client.id)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  const [description, setDescription] = useState(client.project_description || '');
  const [savingDesc, setSavingDesc] = useState(false);
  const descTimeout = useRef<NodeJS.Timeout | null>(null);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskNotes, setEditingTaskNotes] = useState('');

  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    setDescription(client.project_description || '');
  }, [client.id, client.project_description]);

  function handleDescriptionChange(value: string) {
    setDescription(value);
    if (descTimeout.current) clearTimeout(descTimeout.current);
    descTimeout.current = setTimeout(async () => {
      setSavingDesc(true);
      await supabase.from('clients').update({ project_description: value }).eq('id', client.id);
      setSavingDesc(false);
    }, 800);
  }

  async function handleProjectStatusChange(newStatus: ProjectStatus) {
    await supabase.from('clients').update({ project_status: newStatus }).eq('id', client.id);
    onReload();
  }

  async function handlePaymentStatusChange(newStatus: PaymentStatus) {
    await supabase.from('clients').update({ payment_status: newStatus }).eq('id', client.id);
    onReload();
  }

  async function handleDeadlineChange(value: string) {
    await supabase.from('clients').update({ deadline: value || null }).eq('id', client.id);
    onReload();
  }

  async function handleStartDateChange(value: string) {
    await supabase.from('clients').update({ start_date: value || null }).eq('id', client.id);
    onReload();
  }

  async function handleFeeChange(value: string) {
    const v = parseFloat(value) || 0;
    await supabase.from('clients').update({ retainer: v }).eq('id', client.id);
    onReload();
  }

  async function addTask() {
    if (!newTaskTitle.trim()) return;
    await supabase.from('project_tasks').insert([{
      client_id: client.id,
      title: newTaskTitle.trim(),
      status: 'todo',
    }]);
    setNewTaskTitle('');
    onReload();
  }

  async function cycleTaskStatus(task: ProjectTask) {
    const idx = TASK_STATUSES.indexOf(task.status);
    const next = TASK_STATUSES[(idx + 1) % TASK_STATUSES.length];
    await supabase.from('project_tasks').update({ status: next }).eq('id', task.id);
    onReload();
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return;
    await supabase.from('project_tasks').delete().eq('id', id);
    onReload();
  }

  async function saveTaskNotes(id: string) {
    await supabase.from('project_tasks').update({ notes: editingTaskNotes }).eq('id', id);
    setEditingTaskId(null);
    setEditingTaskNotes('');
    onReload();
  }

  async function addNote() {
    if (!newNoteText.trim()) return;
    setAddingNote(true);
    await supabase.from('project_notes').insert([{
      client_id: client.id,
      text: newNoteText.trim(),
    }]);
    setNewNoteText('');
    setAddingNote(false);
    onReload();
  }

  async function deleteNote(id: string) {
    if (!confirm('Delete this note?')) return;
    await supabase.from('project_notes').delete().eq('id', id);
    onReload();
  }

  const projectStatus = client.project_status || 'Planning';
  const paymentStatus = client.payment_status || 'Unpaid';
  const psColors = PROJECT_STATUS_COLORS[projectStatus];
  const paymColors = PAYMENT_STATUS_COLORS[paymentStatus];

  const doneCount = clientTasks.filter(t => t.status === 'done').length;
  const totalCount = clientTasks.length;

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Project Value</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>{fm(client.retainer)}</div>
          <input
            type="number"
            defaultValue={client.retainer || 0}
            onBlur={e => handleFeeChange(e.target.value)}
            style={{ marginTop: 6, width: '100%', background: '#0d0d0d', border: '0.5px solid #2a2a2a', color: '#888', borderRadius: 4, padding: '3px 6px', fontSize: 11, fontFamily: 'inherit' }}
          />
        </div>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Project Status</div>
          <select
            value={projectStatus}
            onChange={e => handleProjectStatusChange(e.target.value as ProjectStatus)}
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 8px',
              borderRadius: 4,
              background: psColors.bg,
              color: psColors.text,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              width: '100%',
              appearance: 'none',
              WebkitAppearance: 'none',
            }}
          >
            {PROJECT_STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Start Date</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{formatDate(client.start_date)}</div>
          <input
            type="date"
            value={client.start_date || ''}
            onChange={e => handleStartDateChange(e.target.value)}
            style={{ width: '100%', background: '#0d0d0d', border: '0.5px solid #2a2a2a', color: '#888', borderRadius: 4, padding: '3px 6px', fontSize: 11, fontFamily: 'inherit' }}
          />
        </div>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Deadline</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: client.deadline ? '#f59e0b' : '#888', marginBottom: 4 }}>{formatDate(client.deadline)}</div>
          <input
            type="date"
            value={client.deadline || ''}
            onChange={e => handleDeadlineChange(e.target.value)}
            style={{ width: '100%', background: '#0d0d0d', border: '0.5px solid #2a2a2a', color: '#888', borderRadius: 4, padding: '3px 6px', fontSize: 11, fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* Project Overview */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project Overview</div>
          {savingDesc && <span style={{ fontSize: 9, color: '#444' }}>Saving...</span>}
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{client.name}</div>
          <textarea
            className="form-input"
            value={description}
            onChange={e => handleDescriptionChange(e.target.value)}
            placeholder="Describe the project, scope, deliverables, key requirements..."
            style={{ minHeight: 80, resize: 'vertical', lineHeight: 1.6, fontSize: 12, width: '100%' }}
          />
        </div>

        {/* Deliverables */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Project Deliverables {totalCount > 0 && <span style={{ color: '#666', marginLeft: 6 }}>({doneCount}/{totalCount})</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input
            className="form-input"
            value={newTaskTitle}
            onChange={e => setNewTaskTitle(e.target.value)}
            placeholder="Add a deliverable..."
            style={{ flex: 1, fontSize: 12 }}
            onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
          />
          <button
            className="btn-primary"
            style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }}
            onClick={addTask}
          >
            + Add
          </button>
        </div>

        {clientTasks.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12, padding: '10px 0', textAlign: 'center' }}>No deliverables yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {clientTasks.map(task => {
              const tc = TASK_STATUS_COLORS[task.status];
              const isEditing = editingTaskId === task.id;
              return (
                <div key={task.id} style={{ background: '#111', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => cycleTaskStatus(task)}
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: tc.bg,
                        color: tc.text,
                        border: 'none',
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        flexShrink: 0,
                        minWidth: 80,
                        textAlign: 'center',
                      }}
                      title="Click to change status"
                    >
                      {TASK_STATUS_LABELS[task.status]}
                    </button>
                    <span style={{
                      fontSize: 12,
                      color: task.status === 'done' ? '#555' : '#ccc',
                      textDecoration: task.status === 'done' ? 'line-through' : 'none',
                      flex: 1,
                    }}>
                      {task.title}
                    </span>
                    <button
                      style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}
                      onClick={() => {
                        if (isEditing) {
                          setEditingTaskId(null);
                          setEditingTaskNotes('');
                        } else {
                          setEditingTaskId(task.id);
                          setEditingTaskNotes(task.notes || '');
                        }
                      }}
                      title="Edit notes"
                    >
                      ✎
                    </button>
                    <button
                      className="btn-danger"
                      style={{ padding: '2px 6px', fontSize: 10, flexShrink: 0 }}
                      onClick={() => deleteTask(task.id)}
                    >
                      ✕
                    </button>
                  </div>
                  {isEditing ? (
                    <div style={{ marginTop: 8 }}>
                      <textarea
                        className="form-input"
                        value={editingTaskNotes}
                        onChange={e => setEditingTaskNotes(e.target.value)}
                        placeholder="Notes for this deliverable..."
                        style={{ width: '100%', minHeight: 50, fontSize: 12, resize: 'vertical' }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                        <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => { setEditingTaskId(null); setEditingTaskNotes(''); }}>Cancel</button>
                        <button className="btn-primary" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => saveTaskNotes(task.id)}>Save</button>
                      </div>
                    </div>
                  ) : (
                    task.notes && (
                      <div style={{ fontSize: 11, color: '#666', marginTop: 6, paddingLeft: 88, lineHeight: 1.5 }}>
                        {task.notes}
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Communication & Notes */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Communication & Notes
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input
            className="form-input"
            value={newNoteText}
            onChange={e => setNewNoteText(e.target.value)}
            placeholder="Log an update, client feedback, revision request..."
            style={{ flex: 1, fontSize: 12 }}
            onKeyDown={e => { if (e.key === 'Enter') addNote(); }}
          />
          <button
            className="btn-primary"
            style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }}
            onClick={addNote}
            disabled={addingNote}
          >
            + Add Note
          </button>
        </div>

        {clientNotes.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12, padding: '10px 0', textAlign: 'center' }}>No notes yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {clientNotes.map(note => (
              <div key={note.id} style={{
                background: '#111',
                borderRadius: 6,
                padding: '10px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>
                    {note.created_at ? new Date(note.created_at).toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No date'}
                  </div>
                  <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {note.text}
                  </div>
                </div>
                <button
                  className="btn-danger"
                  style={{ padding: '2px 6px', fontSize: 10, flexShrink: 0 }}
                  onClick={() => deleteNote(note.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Billing */}
      <div className="card">
        <div style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Billing</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Project Fee</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>{fm(client.retainer)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Payment Status</div>
            <select
              value={paymentStatus}
              onChange={e => handlePaymentStatusChange(e.target.value as PaymentStatus)}
              style={{
                fontSize: 13,
                fontWeight: 700,
                padding: '6px 10px',
                borderRadius: 6,
                background: paymColors.bg,
                color: paymColors.text,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                width: '100%',
                appearance: 'none',
                WebkitAppearance: 'none',
              }}
            >
              {PAYMENT_STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 14, padding: '10px 12px', background: '#0d0d0d', borderRadius: 6, fontSize: 11, color: '#666', lineHeight: 1.5 }}>
          To log received payments by month, use the Finance tab — open this client's revenue cell and enter the actual amount received for that month.
        </div>
      </div>
    </div>
  );
}
