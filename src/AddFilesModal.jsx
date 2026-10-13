import { useState } from "react";
import { IconCheck, IconChevronRight } from "@tabler/icons-react";
import { filesInDirectory, planAddedFiles } from "./fileSystem.js";
import { parseNodeKey } from "./treeOverlay.js";
import { FolderIcon, TreeRail } from "./TreeView.jsx";
import { folderLevelColor } from "./appHelpers.js";

function countFiles(node) {
  return node.kind === "file" ? 1 : node.children.reduce((sum, c) => sum + countFiles(c), 0);
}

// One folder row of the destination picker — same row, rail, colour and
// expand animation as the sidebar tree (folders only). Tapping the row picks
// it (and opens it, to show what's inside); the chevron only opens/closes.
function DestNode({ node, depth, ancestorsLast, isLast, selectedKey, expanded, onSelect, onToggle, disabled }) {
  const subfolders = node.children.filter((c) => c.kind === "directory");
  const isOpen = expanded.has(node.key);
  const selected = selectedKey === node.key;

  function pick() {
    if (disabled) return;
    onSelect(node.key);
    if (subfolders.length > 0 && !isOpen) onToggle(node.key);
  }

  return (
    <div className="tree-folder">
      <div
        className={`tree-folder-label add-dest-row${selected ? " is-dest" : ""}`}
        style={{ "--level-color": folderLevelColor(depth) }}
        role="radio"
        aria-checked={selected}
        tabIndex={0}
        onClick={pick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pick();
          }
        }}
      >
        {depth > 0 && <TreeRail ancestorsLast={ancestorsLast} isLast={isLast} />}
        <span
          className={`add-dest-chevron${isOpen ? " open" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            if (subfolders.length > 0) onToggle(node.key);
          }}
        >
          {subfolders.length > 0 && <IconChevronRight size={12} aria-hidden="true" />}
        </span>
        <FolderIcon />
        <span className="tree-label">{node.name}</span>
        <span className="add-dest-count">{countFiles(node)}</span>
        {selected && <IconCheck className="add-dest-check" size={14} aria-hidden="true" />}
      </div>
      {isOpen && subfolders.length > 0 && (
        <div className="tree-children">
          {subfolders.map((child, i) => (
            <DestNode
              key={child.key}
              node={child}
              depth={depth + 1}
              ancestorsLast={[...ancestorsLast, isLast]}
              isLast={i === subfolders.length - 1}
              selectedKey={selectedKey}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// "Contracts › Signed › 2025" for the selected node, from the displayed tree.
function displayedPath(folders, nodeKey) {
  function walk(node, trail) {
    const next = [...trail, node.name];
    if (node.key === nodeKey) return next;
    for (const c of node.children) {
      if (c.kind !== "directory") continue;
      const hit = walk(c, next);
      if (hit) return hit;
    }
    return null;
  }
  for (const f of folders) {
    const hit = walk(f.tree, []);
    if (hit) return hit;
  }
  return [];
}

// Same modal shell as AnnotationModePicker.jsx. Shown after the user has
// picked PDFs from the sidebar's floating + menu → "Add files": the
// destination is chosen in a folders-only tree that mirrors the sidebar
// (including hidden/moved/reordered folders), then any name already taken
// there gets Replace / Keep both.
//
// `folders` is [{ key, name, tree, rawTree, writesToDisk }]: `tree` is the
// displayed (overlaid) tree this picker draws; `rawTree` is the real
// on-disk shape, which is where files physically land — a node's key
// always points back at its real folder (see parseNodeKey), wherever the
// overlay shows it.
export default function AddFilesModal({ folders, files, busy, onConfirm, onClose, closing }) {
  const [selectedKey, setSelectedKey] = useState(folders[0].tree.key);
  const [expanded, setExpanded] = useState(() => new Set([folders[0].tree.key]));
  const [choices, setChoices] = useState({});

  const parsed = parseNodeKey(selectedKey, folders.map((f) => f.name));
  const target = folders.find((f) => f.name === parsed?.rootName) ?? folders[0];
  const destPath = parsed?.relPath ?? "";

  const plan = planAddedFiles(
    files,
    filesInDirectory(target.rawTree, destPath).map((f) => f.name),
    choices
  );
  const anyReplace = plan.some((p) => p.replaces);
  // A clash is any file whose name is already taken in the destination —
  // that's exactly when "keep both" had to rename it or "replace" is on.
  const clashes = plan.map((p, i) => p.replaces || p.name !== files[i].name);

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
        <div className="add-dest-tree" role="radiogroup" aria-label="Save to">
          {folders.map((f, i) => (
            <DestNode
              key={f.key}
              node={f.tree}
              depth={0}
              ancestorsLast={[]}
              isLast={i === folders.length - 1}
              selectedKey={selectedKey}
              expanded={expanded}
              onSelect={setSelectedKey}
              onToggle={toggle}
              disabled={busy}
            />
          ))}
        </div>
        <div className="add-files-path">
          Saving to <b>{displayedPath(folders, selectedKey).join(" › ")}</b>
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

        {anyReplace && target.writesToDisk && (
          <div className="add-files-warning">Replace overwrites the file in your folder on disk. Can't be undone.</div>
        )}

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
