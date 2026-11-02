import { useState } from "react";
import ChamferFrame from "@brand/ChamferFrame";

// Same modal shell as ConfirmRemoveModal. `request` is { name } — the name
// shown now. Only the name drawn in the app changes; the file itself isn't
// touched.
export default function RenameModal({ request, onConfirm, onClose, closing }) {
  const [value, setValue] = useState(request.name);
  const trimmed = value.trim();
  const submit = () => {
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={onClose} />
      <ChamferFrame className={`modal-dialog mode-picker-dialog${closing ? " is-closing" : ""}`}>
        <div className="update-dialog-header">
          <div>
            <div className="update-dialog-title">RENAME</div>
            <div className="update-dialog-subtitle">{request.name}</div>
          </div>
        </div>

        <div className="update-dialog-body">
          <input
            className="rename-input"
            type="text"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <div className="update-dialog-actions">
          <button className="cb-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="cb-btn update-dialog-now" onClick={submit} disabled={!trimmed}>
            Rename
          </button>
        </div>
      </ChamferFrame>
    </>
  );
}
