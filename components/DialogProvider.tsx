'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// ============================================================================
// The app's own dialogs, replacing window.alert / window.confirm.
//
// Native dialogs are OS chrome: they ignore every theme token, block the whole
// tab while they're up, can't be dismissed consistently with Escape, and look
// nothing like the rest of the OS. ConfirmDelete already made that argument for
// the delete buttons; this is the same argument for every other call site.
//
// Mounted once in app/layout.tsx, so any component can reach it:
//
//   const { toast, confirm } = useDialogs();
//   toast("Couldn't save: …", true);
//   if (!(await confirm('Delete this video?'))) return;
//
// `confirm` returns a promise so it drops straight into the `if (!confirm(…))
// return;` shape the native calls used — the only change at a call site is an
// `await`.
// ============================================================================

interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for destructive actions. */
  danger?: boolean;
}

interface DialogApi {
  toast: (message: string, isError?: boolean) => void;
  /** Error toast — the direct replacement for an alert() call. */
  toastError: (message: string) => void;
  confirm: (opts: string | ConfirmOptions) => Promise<boolean>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs must be used inside <DialogProvider>');
  return ctx;
}

interface Toast { id: number; message: string; isError: boolean }
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

export default function DialogProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const seq = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const toast = useCallback((message: string, isError = false) => {
    const id = ++seq.current;
    setToasts(prev => [...prev, { id, message, isError }]);
    // Errors linger: they usually carry something worth reading.
    const t = setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), isError ? 5000 : 2200);
    timers.current.push(t);
  }, []);

  const confirm = useCallback((opts: string | ConfirmOptions) => {
    const o = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise<boolean>(resolve => setPending({ ...o, resolve }));
  }, []);

  // Land focus on the confirming action, so Enter works and Escape has somewhere
  // sensible to return from.
  useEffect(() => { if (pending) confirmRef.current?.focus(); }, [pending]);

  const settle = useCallback((ok: boolean) => {
    setPending(prev => { prev?.resolve(ok); return null; });
  }, []);

  // Escape cancels. Capture, so it wins over any panel's own Escape handler —
  // this dialog is the topmost thing on screen while it's up.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      settle(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [pending, settle]);

  const toastError = useCallback((message: string) => toast(message, true), [toast]);

  const api = useMemo(() => ({ toast, toastError, confirm }), [toast, toastError, confirm]);

  return (
    <DialogContext.Provider value={api}>
      {children}

      {toasts.length > 0 && (
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map(t => (
            <div key={t.id} className={t.isError ? 'idea-toast is-error' : 'idea-toast'}>{t.message}</div>
          ))}
        </div>
      )}

      {pending && (
        <div className="modal-overlay confirm-overlay" onClick={() => settle(false)}>
          <div
            className="modal-box confirm-box"
            role="alertdialog"
            aria-modal="true"
            aria-label={pending.title ?? 'Confirm'}
            onClick={e => e.stopPropagation()}
          >
            <div className="confirm-title font-head">{pending.title ?? 'Are you sure?'}</div>
            <div className="confirm-message">{pending.message}</div>
            <div className="confirm-actions">
              <button className="btn-ghost confirm-btn" onClick={() => settle(false)}>
                {pending.cancelLabel ?? 'Cancel'}
              </button>
              <button
                ref={confirmRef}
                className={pending.danger === false ? 'btn-primary confirm-btn' : 'btn-danger confirm-btn'}
                onClick={() => settle(true)}
              >
                {pending.confirmLabel ?? 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
