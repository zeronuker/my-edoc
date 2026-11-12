import ChamferFrame from "@brand/ChamferFrame";

// Same modal shell as the other dialogs. Asked before an outline link leaves
// the app: the address comes from the PDF itself, so it is shown in full.
// `request` is { url }.
export default function LinkConfirmModal({ request, onConfirm, onClose, closing }) {
  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={onClose} />
      <ChamferFrame className={`modal-dialog mode-picker-dialog${closing ? " is-closing" : ""}`}>
        <div className="update-dialog-header">
          <div>
            <div className="update-dialog-title">OPEN LINK?</div>
            <div className="update-dialog-subtitle">Opens in a new tab</div>
          </div>
        </div>

        <div className="update-dialog-body link-confirm-url">{request.url}</div>

        <div className="update-dialog-actions">
          <button className="cb-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="cb-btn update-dialog-now" autoFocus onClick={onConfirm}>
            Open
          </button>
        </div>
      </ChamferFrame>
    </>
  );
}
