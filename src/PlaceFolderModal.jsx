import { useState } from "react";
import { displayedPath, pathKeys } from "./treeOverlay.js";
import DestinationTree from "./DestinationTree.jsx";

// Same modal shell as AddFilesModal.jsx. Asks where a connected folder
// should appear: after + → Add folder (when at least one folder is already
// connected), or from a folder's move button. Choosing a spot only changes
// where the folder is *shown* — it stays its own folder with its own copy.
// `folders` is the top-level display folders; onConfirm gets a node key, or
// null for the top level. When moving, `initialKey` is where it sits now and
// `excludeKeys` are the folder itself and what's inside it (a folder can't
// go into itself).
export default function PlaceFolderModal({
  folderName,
  folders,
  onConfirm,
  onClose,
  closing,
  title = "ADD FOLDER",
  confirmLabel = "Add folder",
  initialKey = null,
  excludeKeys,
}) {
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [expanded, setExpanded] = useState(() => new Set(initialKey ? pathKeys(folders, initialKey) : []));

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
            <div className="update-dialog-title">{title}</div>
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
          excludeKeys={excludeKeys}
        />
        <div className="add-files-path">
          Showing <b>{folderName}</b> in <b>{where.join(" › ")}</b>
        </div>

        <div className="update-dialog-actions">
          <button className="cb-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="cb-btn update-dialog-now" onClick={() => onConfirm(selectedKey)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
