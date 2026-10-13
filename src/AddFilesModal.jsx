import { useState } from "react";
import { filesInDirectory, listDirectoryPaths, planAddedFiles } from "./fileSystem.js";

// Same modal shell as AnnotationModePicker.jsx. Shown after the user has
// picked PDFs from a folder's ⋮ → "Add files": chooses which folder inside
// the connected root they land in, and — for any name already taken there —
// whether to replace it or keep both.
export default function AddFilesModal({ folderName, tree, files, writesToDisk, busy, onConfirm, onClose, closing }) {
  const [destPath, setDestPath] = useState("");
  const [choices, setChoices] = useState({});

  const plan = planAddedFiles(
    files,
    filesInDirectory(tree, destPath).map((f) => f.name),
    choices
  );
  const anyReplace = plan.some((p) => p.replaces);
  // A clash is any file whose name is already taken in the destination —
  // that's exactly when "keep both" had to rename it or "replace" is on.
  const clashes = plan.map((p, i) => p.replaces || p.name !== files[i].name);

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={busy ? undefined : onClose} />
      <div className={`modal-dialog add-files-dialog${closing ? " is-closing" : ""}`}>
        <div className="update-dialog-header">
          <span className="update-dialog-icon">+</span>
          <div>
            <div className="update-dialog-title">ADD FILES</div>
            <div className="update-dialog-subtitle">{folderName}</div>
          </div>
        </div>

        <label className="add-files-dest">
          <span>Add to</span>
          <select value={destPath} onChange={(e) => setDestPath(e.target.value)} disabled={busy}>
            {listDirectoryPaths(tree).map((p) => (
              <option key={p} value={p}>
                {p || `${folderName} (top level)`}
              </option>
            ))}
          </select>
        </label>

        <div className="add-files-list">
          {plan.map((p, i) => (
            <div className="add-files-row" key={i}>
              <span className="add-files-name" title={p.name}>
                {p.name}
              </span>
              {clashes[i] && (
                <span className="add-files-choice">
                  <button
                    className={p.replaces ? "" : "active"}
                    disabled={busy}
                    onClick={() => setChoices((c) => ({ ...c, [i]: "keep" }))}
                  >
                    Keep both
                  </button>
                  <button
                    className={p.replaces ? "active" : ""}
                    disabled={busy}
                    onClick={() => setChoices((c) => ({ ...c, [i]: "replace" }))}
                  >
                    Replace
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>

        {anyReplace && writesToDisk && (
          <div className="add-files-warning">Replace overwrites the file in your folder on disk. Can't be undone.</div>
        )}

        <div className="update-dialog-actions">
          <button className="cb-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="cb-btn update-dialog-now" onClick={() => onConfirm(destPath, choices)} disabled={busy}>
            {busy ? "Adding…" : `Add ${files.length} file${files.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </>
  );
}
