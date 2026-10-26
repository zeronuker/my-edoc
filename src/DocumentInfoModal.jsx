import ChamferFrame from "@brand/ChamferFrame";
// The "Document properties" dialog: a read-only list of what the open PDF says
// about itself. `rows` is [{ label, value }] from docInfoRows (appHelpers.js).
export default function DocumentInfoModal({ rows, onClose, closing }) {
  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={onClose} />
      <ChamferFrame
        role="dialog"
        aria-modal="true"
        aria-label="Document properties"
        className={`modal-dialog mode-picker-dialog${closing ? " is-closing" : ""}`}
      >
        <div className="update-dialog-header">
          <span className="update-dialog-icon">i</span>
          <div className="update-dialog-title">Document properties</div>
        </div>

        <dl className="docinfo-list">
          {rows.map(({ label, value }) => (
            <div key={label} className="docinfo-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="update-dialog-actions choice-actions">
          <button className="cb-btn update-dialog-now" autoFocus onClick={onClose}>
            Close
          </button>
        </div>
      </ChamferFrame>
    </>
  );
}
