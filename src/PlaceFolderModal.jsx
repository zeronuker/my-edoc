import { useState } from "react";
import { displayedPath } from "./treeOverlay.js";
import DestinationTree from "./DestinationTree.jsx";

// Same modal shell as AddFilesModal.jsx. Shown after the user has picked a
// folder with + → Add folder (and at least one folder is already connected):
// asks where it should appear. Choosing a spot only changes where the new
// folder is *shown* — it stays its own connected folder with its own copy.
// `folders` is the top-level display folders; onConfirm gets a node key, or
// null for the top level.
export default function PlaceFolderModal({ folderName, folders, onConfirm, onClose, closing }) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  function toggle(key) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const where = selectedKey === null ? ["Top level"] : displayedPath(folders, selectedKey);

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={onClose} />
      <div className={`modal-dialog add-files-dialog${closing ? " is-closing" : ""}`}>
        <div className="update-dialog-header">
          <span className="update-dialog-icon">+</span>
          <div>
            <div className="update-dialog-title">ADD FOLDER</div>
            <div className="update-dialog-subtitle">{folderName}</div>
          </div>
        </div>

        <div className="add-files-label">Show it in</div>
        <DestinationTree
          folders={folders}
          selectedKey={selectedKey}
          expanded={expanded}
          onSelect={setSelectedKey}
          onToggle={toggle}
          topLevelLabel="Top level"
          ariaLabel="Show it in"
        />
        <div className="add-files-path">
          Showing <b>{folderName}</b> in <b>{where.join(" › ")}</b>
        </div>

        <div className="update-dialog-actions">
          <button className="cb-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="cb-btn update-dialog-now" onClick={() => onConfirm(selectedKey)}>
            Add folder
          </button>
        </div>
      </div>
    </>
  );
}
