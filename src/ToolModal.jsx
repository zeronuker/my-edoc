import ChamferFrame from "@brand/ChamferFrame";

// Same modal shell as the other dialogs, for a PDF tool that rewrites the
// file (Flatten, and Protect after it): the tool's own options go in as
// children, and every tool ends the same way — save a new file next to the
// original, or replace the original. onSave(replace) resolves once saved.
export default function ToolModal({ title, subtitle, children, canSave = true, busy, onSave, onClose, closing }) {
  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={busy ? undefined : onClose} />
      <ChamferFrame className={`modal-dialog mode-picker-dialog${closing ? " is-closing" : ""}`}>
        <div className="update-dialog-header">
          <div>
            <div className="update-dialog-title">{title}</div>
            <div className="update-dialog-subtitle">{subtitle}</div>
          </div>
        </div>

        <div className="update-dialog-body">{children}</div>

        <div className="update-dialog-actions clash-actions">
          <button className="cb-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="cb-btn" onClick={() => onSave(true)} disabled={!canSave || busy}>
            Replace original
          </button>
          <button className="cb-btn update-dialog-now" onClick={() => onSave(false)} disabled={!canSave || busy}>
            {busy ? "Saving…" : "Save as new file"}
          </button>
        </div>
      </ChamferFrame>
    </>
  );
}
