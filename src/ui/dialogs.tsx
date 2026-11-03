// Themed replacements for window.confirm / window.alert.
import { create } from 'zustand';
import { useEffect } from 'react';

interface DialogRequest {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  danger?: boolean;
  /** Extra buttons shown before the confirm button; resolve with their value. */
  choices?: { label: string; value: string }[];
  resolve: (value: string | null) => void;
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
      dialog: { message, ...opts, cancelLabel: opts.cancelLabel ?? 'Cancel', resolve: (v) => resolve(v !== null) },
    });
  });
}

/** Ask the user to pick one of several actions. Resolves null on cancel. */
export function chooseDialog(
  message: string,
  opts: { title?: string; choices: { label: string; value: string }[]; primary: { label: string; value: string } },
): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogs.setState({
      dialog: {
        message,
        title: opts.title,
        choices: opts.choices,
        confirmLabel: opts.primary.label,
        cancelLabel: 'Cancel',
        resolve: (v) => resolve(v === 'ok' ? opts.primary.value : v),
      },
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

  const close = (value: string | null) => {
    dialog?.resolve(value);
    useDialogs.setState({ dialog: null });
  };

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') close('ok');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
      {dialog && (
        <div className="overlay" style={{ zIndex: 150 }} onClick={() => dialog.cancelLabel && close(null)}>
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
                <button className="btn btn-secondary" onClick={() => close(null)}>
                  {dialog.cancelLabel}
                </button>
              )}
              {dialog.choices?.map((c) => (
                <button key={c.value} className="btn btn-secondary" onClick={() => close(c.value)}>
                  {c.label}
                </button>
              ))}
              <button
                className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close('ok')}
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
