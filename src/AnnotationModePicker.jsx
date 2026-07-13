// Same modal shell as Settings.jsx/CopyProgressModal.jsx. Shown once per
// file, on its first Save — the choice is then remembered (see
// annotations.js) so this never reappears for that file unless the user
// reopens it via the "change" control next to the Save button.
export default function AnnotationModePicker({ fileName, onChoose, onClose }) {
  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-dialog mode-picker-dialog">
        <div className="update-dialog-header">
          <span className="update-dialog-icon">✎</span>
          <div>
            <div className="update-dialog-title">SAVE ANNOTATIONS</div>
            <div className="update-dialog-subtitle">{fileName}</div>
          </div>
        </div>

        <div className="mode-picker-options">
          <button className="mode-picker-option" onClick={() => onChoose("writeback")}>
            <div className="mode-picker-option-title">Save to this file</div>
            <div className="mode-picker-option-desc">
              Replaces your original PDF with the annotated version. Can't be undone.
            </div>
          </button>
          <button className="mode-picker-option" onClick={() => onChoose("sidecar")}>
            <div className="mode-picker-option-title">Save as app copy</div>
            <div className="mode-picker-option-desc">
              Keeps your original file untouched — the annotated version is saved separately in the app.
            </div>
          </button>
        </div>

        <div className="update-dialog-actions">
          <button className="cb-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
