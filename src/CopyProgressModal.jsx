import { progressWindow } from "./appHelpers.js";
import ChamferFrame from "@brand/ChamferFrame";

// Shown while files are being copied into the app's storage — on Add folder,
// Update and Add files. Only a short window of rows around the file being
// copied is drawn, with a count and bar for the rest: drawing one row per
// file made every finished file re-render the whole list, so a big folder
// got slower the bigger it was.
export default function CopyProgressModal({ title, folderName, files, doneCount, onCancel }) {
  const pct = files.length ? Math.round((doneCount / files.length) * 100) : 0;
  const [start, end] = progressWindow(files.length, doneCount);

  return (
    <>
      <div className="modal-backdrop" />
      <ChamferFrame className="modal-dialog copy-progress-dialog">
        <div className="update-dialog-header">
          <span className={`copy-progress-icon${doneCount === files.length ? " done" : ""}`} />
          <div>
            <div className="update-dialog-title">{title.toUpperCase()}</div>
            <div className="update-dialog-subtitle">{folderName}</div>
          </div>
        </div>

        <div className="copy-progress-line">
          <span>
            {doneCount} of {files.length} copied
          </span>
          <span>{pct}%</span>
        </div>
        <div className="copy-progress-bar">
          <div className="copy-progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="copy-file-list">
          {files.slice(start, end).map((file, i) => {
            const isDone = start + i < doneCount;
            return (
              <div key={start + i} className={`copy-file-row${isDone ? " done" : ""}`}>
                <span className="copy-file-check">
                  {isDone && (
                    <svg width="10" height="10" viewBox="0 0 16 16">
                      <path
                        d="M2 8l4 4 8-8"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="copy-file-name">{file.name}</span>
              </div>
            );
          })}
        </div>

        <div className="update-dialog-actions">
          <button className="cb-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </ChamferFrame>
    </>
  );
}
