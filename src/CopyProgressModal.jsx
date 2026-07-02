// Shown while a legacy (Safari/iOS) folder's files are being copied into
// OPFS — both on initial "Add folder" and on a per-folder "Refresh". Not
// used for the live-handle (desktop Chrome/Edge) path, since nothing is
// actually being copied there.
export default function CopyProgressModal({ title, folderName, files, doneSet, onCancel }) {
  const doneCount = doneSet.size;
  const pct = files.length ? Math.round((doneCount / files.length) * 100) : 0;

  return (
    <>
      <div className="modal-backdrop" />
      <div className="modal-dialog copy-progress-dialog">
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
          {files.map((file) => {
            const isDone = doneSet.has(file.relativePath);
            return (
              <div key={file.relativePath} className={`copy-file-row${isDone ? " done" : ""}`}>
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
      </div>
    </>
  );
}
