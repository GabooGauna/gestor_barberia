import { useEffect, useId, useRef } from "react";

export default function ConfirmationDialog({ title, children, confirmLabel, busy, error, onConfirm, onDismiss }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = dialogRef.current;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog.close();
      queueMicrotask(() => {
        if (trigger?.isConnected) trigger.focus();
      });
    };
  }, []);

  return (
    <dialog ref={dialogRef} className="security-dialog audit-confirmation" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={(event) => {
      event.preventDefault();
      if (!busy) onDismiss();
    }}>
      <span className="audit-confirmation-icon" aria-hidden="true">!</span>
      <h3 id={titleId}>{title}</h3>
      <div id={descriptionId} className="audit-confirmation-description">{children}</div>
      {error && <p className="audit-action-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button ref={cancelRef} className="button button--secondary" disabled={busy} onClick={onDismiss}>Volver</button>
        <button className="button button--danger" disabled={busy} onClick={onConfirm}>{busy ? "Cancelando..." : confirmLabel}</button>
      </div>
    </dialog>
  );
}
