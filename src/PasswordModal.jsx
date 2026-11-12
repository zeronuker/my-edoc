import { useState } from "react";
import ChamferFrame from "@brand/ChamferFrame";

// Same modal shell as RenameModal. Asked when a file opens that needs a
// password. The password is typed masked; wrong is true when the one just
// tried did not work.
export default function PasswordModal({ request, onSubmit, onCancel, closing }) {
  const [value, setValue] = useState("");
  const submit = () => value && onSubmit(value);

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} />
      <ChamferFrame className={`modal-dialog mode-picker-dialog${closing ? " is-closing" : ""}`}>
        <div className="update-dialog-header">
          <div>
            <div className="update-dialog-title">PASSWORD NEEDED</div>
            <div className="update-dialog-subtitle">{request.name ?? "This file"}</div>
          </div>
        </div>

        <div className="update-dialog-body">
          <input
            className="rename-input"
            type="password"
            autoFocus
            autoComplete="off"
            aria-label="Password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          {request.wrong && <p className="password-wrong">That password didn't work. Try again.</p>}
        </div>

        <div className="update-dialog-actions">
          <button className="cb-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="cb-btn update-dialog-now" onClick={submit} disabled={!value}>
            Open
          </button>
        </div>
      </ChamferFrame>
    </>
  );
}
