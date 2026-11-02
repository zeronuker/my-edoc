import { useState } from "react";
import ChamferFrame from "@brand/ChamferFrame";

// Same modal shell as ConfirmRemoveModal. Asked once, before a copy starts,
// when some of the files being copied have bookmarks, a saved page or saved
// annotations. `request` is { otherCount, annotatedCount } — how many files
// have each. onChoose gets { bookmarks, annotations }, or null to cancel.
export default function CopyExtrasModal({ request, onChoose, closing }) {
  const { otherCount, annotatedCount } = request;
  const [bookmarks, setBookmarks] = useState(true);
  const [annotations, setAnnotations] = useState(true);
  const files = (n) => `${n} file${n === 1 ? "" : "s"}`;

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={() => onChoose(null)} />
      <ChamferFrame className={`modal-dialog mode-picker-dialog${closing ? " is-closing" : ""}`}>
        <div className="update-dialog-header">
          <div>
            <div className="update-dialog-title">COPY WITH NOTES?</div>
            <div className="update-dialog-subtitle">Bookmarks and annotations</div>
          </div>
        </div>

        <div className="update-dialog-body">
          <p>Some of these files have their own notes. Copy them along, or start the copies clean.</p>
          {otherCount > 0 && (
            <label className="clash-all">
              <input type="checkbox" checked={bookmarks} onChange={(e) => setBookmarks(e.target.checked)} />
              Bookmarks and saved page ({files(otherCount)})
            </label>
          )}
          {annotatedCount > 0 && (
            <label className="clash-all">
              <input type="checkbox" checked={annotations} onChange={(e) => setAnnotations(e.target.checked)} />
              Annotations ({files(annotatedCount)})
            </label>
          )}
        </div>

        <div className="update-dialog-actions">
          <button className="cb-btn" onClick={() => onChoose(null)}>
            Cancel
          </button>
          <button
            className="cb-btn update-dialog-now"
            onClick={() => onChoose({ bookmarks: otherCount > 0 && bookmarks, annotations: annotatedCount > 0 && annotations })}
          >
            Copy
          </button>
        </div>
      </ChamferFrame>
    </>
  );
}
