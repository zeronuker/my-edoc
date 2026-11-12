import { useEffect, useRef } from "react";
import ChamferFrame from "@brand/ChamferFrame";

const AUTO_CLOSE_MS = 15000;

// Shown after files were added, sent or received (see resultMessage). `added`
// is the green line, `warning` the amber one, `names` the files that were
// skipped. With nothing skipped it closes itself after a while; with skipped
// files it stays until OK so the list can't be missed.
export default function UploadResultModal({ title, subtitle, added, warning, names, onClose, closing }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const auto = names.length === 0;
  useEffect(() => {
    if (!auto) return undefined;
    const t = setTimeout(() => closeRef.current(), AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [auto]);

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} />
      <ChamferFrame
        className={`modal-dialog copy-progress-dialog${closing ? " is-closing" : ""}`}
        role="alertdialog"
        aria-label={title}
      >
        <div className="update-dialog-header">
          <span className={`copy-progress-icon done${warning ? " warn" : ""}`} />
          <div>
            <div className="update-dialog-title">{title}</div>
            <div className="update-dialog-subtitle">{subtitle}</div>
          </div>
        </div>

        {added && <p className="result-line result-ok">{added}</p>}
        {warning && <p className="result-line result-warn">{warning}</p>}

        {names.length > 0 && (
          <div className="copy-file-list result-names">
            {names.map((name) => (
              <div key={name} className="copy-file-row">
                <span className="copy-file-name">{name}</span>
              </div>
            ))}
          </div>
        )}

        <div className="update-dialog-actions">
          <button className="cb-btn update-dialog-now" autoFocus onClick={onClose}>
            OK
          </button>
        </div>
      </ChamferFrame>
    </>
  );
}
