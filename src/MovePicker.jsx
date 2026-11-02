import { useState } from "react";
import { IconChevronLeft, IconChevronRight, IconCopy, IconFolderShare, IconX } from "@tabler/icons-react";
import { flattenByKey, isInside } from "./treeOverlay.js";
import { FolderIcon } from "./TreeView.jsx";

// Full-screen "move to" sheet: one folder level at a time, so it stays
// usable on a phone. `folders` is the top-level display folders and `moving`
// the ticked nodes. onConfirm gets the chosen folder's node key, or null for
// the top level (only offered when every moving node is a connected folder).
export default function MovePicker({ folders, moving, onConfirm, onClose, copy = false }) {
  const [trail, setTrail] = useState([]); // node keys, outermost first
  const byKey = flattenByKey(folders);
  const here = trail.length ? byKey.get(trail[trail.length - 1]) : null;
  const hereKey = here ? here.key : null;

  // Can't go into something being moved, or anything inside it.
  const blocked = (node) => moving.some((m) => isInside(node.key, m.key, byKey));
  const rows = (here ? here.children : folders.map((f) => f.tree).filter(Boolean)).filter(
    (n) => n.kind === "directory" && !blocked(n)
  );

  const allRoots = moving.every((m) => m.folderRef);
  // A copy can land next to its original; a move there would do nothing.
  const alreadyHere = !copy && moving.every((m) => (m.parentKey ?? null) === hereKey);
  let hint = null;
  if (here === null && !allRoots) hint = `Open a folder to ${copy ? "copy" : "move"} into`;
  else if (alreadyHere) hint = "Already here";

  const crumbs = [{ key: null, name: "Top level" }, ...trail.map((k) => ({ key: k, name: byKey.get(k).name }))];
  const verb = copy ? "Copy" : "Move";
  const title = moving.length === 1 ? `${verb} "${moving[0].name}"` : `${verb} ${moving.length} items`;

  return (
    <div className="move-picker" role="dialog" aria-label={title}>
      <div className="move-picker-head">
        <button
          className="icon-btn"
          aria-label="Back"
          onClick={() => (trail.length ? setTrail(trail.slice(0, -1)) : onClose())}
        >
          <IconChevronLeft size={18} />
        </button>
        <div className="move-picker-title">{title}</div>
      </div>

      <div className="move-picker-crumbs">
        {crumbs.map((c, i) => (
          <button
            key={c.key ?? "top"}
            className="move-picker-crumb"
            disabled={i === crumbs.length - 1}
            onClick={() => setTrail(trail.slice(0, i))}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="move-picker-list">
        {rows.length === 0 && <p className="folders-empty-hint">No folders here.</p>}
        {rows.map((n) => (
          <button key={n.key} className="move-picker-row" onClick={() => setTrail([...trail, n.key])}>
            <FolderIcon />
            <span className="move-picker-name">{n.name}</span>
            <IconChevronRight size={16} />
          </button>
        ))}
      </div>

      <div className="move-picker-foot">
        <span className="move-picker-hint">{hint}</span>
        <button className="cb-btn" onClick={onClose}>
          <IconX size={14} /> Cancel
        </button>
        <button className="cb-btn update-dialog-now" disabled={!!hint} onClick={() => onConfirm(hereKey)}>
          {copy ? <IconCopy size={14} /> : <IconFolderShare size={14} />} {verb} here
        </button>
      </div>
    </div>
  );
}
