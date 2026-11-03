// Themed replacements for window.confirm / window.alert.
import { create } from 'zustand';
import { useEffect } from 'react';

interface DialogRequest {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface DialogState {
  dialog: DialogRequest | null;
  toast: string | null;
}

const useDialogs = create<DialogState>(() => ({ dialog: null, toast: null }));

export function confirmDialog(
  message: string,
  opts: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogs.setState({
      dialog: { message, ...opts, cancelLabel: opts.cancelLabel ?? 'Cancel', resolve },
    });
  });
}

export function alertDialog(message: string, title?: string): Promise<void> {
  return new Promise((resolve) => {
    useDialogs.setState({
      dialog: { message, title, confirmLabel: 'OK', cancelLabel: null, resolve: () => resolve() },
    });
  });
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string) {
  clearTimeout(toastTimer);
  useDialogs.setState({ toast: message });
  toastTimer = setTimeout(() => useDialogs.setState({ toast: null }), 2200);
}

export function DialogHost() {
  const { dialog, toast } = useDialogs();

  const close = (ok: boolean) => {
    dialog?.resolve(ok);
    useDialogs.setState({ dialog: null });
  };

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
      {dialog && (
        <div className="overlay" style={{ zIndex: 150 }} onClick={() => dialog.cancelLabel && close(false)}>
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            style={{ width: 'min(560px, 100%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {dialog.title && <h2>{dialog.title}</h2>}
            <p className="modal-text">{dialog.message}</p>
            <div className="modal-footer">
              {dialog.cancelLabel && (
                <button className="btn btn-secondary" onClick={() => close(false)}>
                  {dialog.cancelLabel}
                </button>
              )}
              <button
                className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
                autoFocus
              >
                {dialog.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
