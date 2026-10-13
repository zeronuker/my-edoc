import { useState } from "react";
import { filesInDirectory, planAddedFiles } from "./fileSystem.js";
import { freeSpaceWarning } from "./appHelpers.js";
import { displayedPath, parseNodeKey } from "./treeOverlay.js";
import DestinationTree from "./DestinationTree.jsx";

// Same modal shell as ConfirmRemoveModal.jsx. Shown after the user has
// picked PDFs from the sidebar's floating + menu → "Add files": the
// destination is chosen in a folders-only tree that mirrors the sidebar
// (including hidden/moved/reordered folders and folders placed inside
// others), then any name already taken there gets Replace / Keep both.
//
// `folders` is every connected folder, [{ key, name, tree, rawTree,
// nested }]: `tree` is the displayed (overlaid) root this
// picker draws — nested ones are drawn inside their parent, not as a row of
// their own; `rawTree` is the real on-disk shape, which is where files
// physically land — a node's key always points back at its real folder
// (see parseNodeKey), wherever the overlay shows it.
export default function AddFilesModal({ folders, files, busy, onConfirm, onClose, closing, freeBytes }) {
  const topLevel = folders.filter((f) => !f.nested);
  const [selectedKey, setSelectedKey] = useState(topLevel[0].tree.key);
  const [expanded, setExpanded] = useState(() => new Set([topLevel[0].tree.key]));
  const [choices, setChoices] = useState({});

  const parsed = parseNodeKey(selectedKey, folders.map((f) => f.name));
  const target = folders.find((f) => f.name === parsed?.rootName) ?? topLevel[0];
  const destPath = parsed?.relPath ?? "";

  const plan = planAddedFiles(
    files,
    filesInDirectory(target.rawTree, destPath).map((f) => f.name),
    choices
  );
  // A clash is any file whose name is already taken in the destination —
  // that's exactly when "keep both" had to rename it or "replace" is on.
  const clashes = plan.map((p, i) => p.replaces || p.name !== files[i].name);

  // Replace is counted at full size too, which is the safe side.
  const spaceNote = freeSpaceWarning(
    files.length === 1 ? "This file" : "These files",
    files.reduce((sum, f) => sum + f.size, 0),
    freeBytes
  );

  function toggle(key) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={busy ? undefined : onClose} />
      <div className={`modal-dialog add-files-dialog${closing ? " is-closing" : ""}`}>
        <div className="update-dialog-header">
          <span className="update-dialog-icon">+</span>
          <div>
            <div className="update-dialog-title">ADD FILES</div>
            <div className="update-dialog-subtitle">
              {files.length} PDF{files.length === 1 ? "" : "S"} SELECTED
            </div>
          </div>
        </div>

        <div className="add-files-label">Save to</div>
        <DestinationTree
          folders={topLevel}
          selectedKey={selectedKey}
          expanded={expanded}
          onSelect={setSelectedKey}
          onToggle={toggle}
          disabled={busy}
          ariaLabel="Save to"
        />
        <div className="add-files-path">
          Saving to <b>{displayedPath(topLevel, selectedKey).join(" › ")}</b>
        </div>

        <div className="add-files-list">
          {plan.map((p, i) => (
            <div className="add-files-row" key={i} style={{ "--i": Math.min(i, 8) }}>
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

        {spaceNote && <div className="add-files-warning">{spaceNote}</div>}

        <div className="update-dialog-actions">
          <button className="cb-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="cb-btn update-dialog-now"
            onClick={() => onConfirm(target.key, destPath, choices)}
            disabled={busy}
          >
            {busy ? "Adding…" : `Add ${files.length} file${files.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </>
  );
}
