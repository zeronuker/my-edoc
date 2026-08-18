import { useEffect, useMemo, useRef, useState } from "react";
import { dbGet, dbSet } from "./db.js";
import { applyOverlay, collectFileHandles, emptyOverlay, flattenByKey } from "./treeOverlay.js";

function FolderIcon() {
  return (
    <svg className="tree-icon" viewBox="0 0 16 16" width="14" height="14" fill="none">
      <path
        d="M1.5 3.5h4l1.2 1.5H14a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H1.5a.5.5 0 0 1-.5-.5v-8.5a.5.5 0 0 1 .5-.5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FileIcon() {
  return (
    <svg className="tree-icon" viewBox="0 0 16 16" width="14" height="14" fill="none">
      <path
        d="M3.5 1.5h6l3 3v9a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M9.5 1.5v3h3" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="tree-icon" viewBox="0 0 16 16" width="14" height="14" fill="none">
      <path
        d="M13 3v3.5h-3.5M3 13v-3.5h3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 8a4.5 4.5 0 0 1 7.9-2.95L13 6.5M12.5 8a4.5 4.5 0 0 1-7.9 2.95L3 9.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// "updated just now" / "updated 5 minutes ago" / "updated 3 hours ago" /
// "updated 2 days ago" / "updated 4 months ago" / "updated 1 year ago",
// from a connectedAt epoch-ms timestamp (null if never successfully
// connected/refreshed yet). Months/years are approximate (30/365 days).
export function formatRelativeTime(ms) {
  if (!ms) return null;
  const diff = Date.now() - ms;
  const minute = 60000;
  const hour = 3600000;
  const day = 86400000;
  const month = day * 30;
  const year = day * 365;

  if (diff < minute) return "updated just now";

  let value, unit;
  if (diff < hour) {
    value = Math.floor(diff / minute);
    unit = "minute";
  } else if (diff < day) {
    value = Math.floor(diff / hour);
    unit = "hour";
  } else if (diff < month) {
    value = Math.floor(diff / day);
    unit = "day";
  } else if (diff < year) {
    value = Math.floor(diff / month);
    unit = "month";
  } else {
    value = Math.floor(diff / year);
    unit = "year";
  }
  return `updated ${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

// Chip + a single "more actions" (⋮) button that reveals Refresh/Remove in
// a small menu, instead of showing both as separate icons on the row —
// keeps the row's layout fixed regardless of the folder name or chip
// text length, so nothing shifts around as folders update.
function FolderActions({ folder, isOpen, onToggle, onClose, onRefreshFolder, onRemoveFolder, isRefreshing }) {
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose();
    }
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  const updated = formatRelativeTime(folder.connectedAt);

  return (
    <span className="tree-folder-actions" ref={wrapRef}>
      {updated && (
        <span className="tree-updated-chip" title={new Date(folder.connectedAt).toLocaleString()}>
          {updated}
        </span>
      )}
      <button
        className={`tree-icon-btn tree-kebab${isRefreshing ? " spinning" : ""}`}
        title="More actions"
        aria-label="More actions"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        ⋮
      </button>
      {isOpen && (
        <div className="tree-kebab-menu" onClick={(e) => e.stopPropagation()}>
          <button
            className="tree-kebab-item"
            disabled={isRefreshing}
            onClick={() => {
              onClose();
              onRefreshFolder(folder.key);
            }}
          >
            <RefreshIcon /> {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            className="tree-kebab-item"
            onClick={() => {
              onClose();
              onRemoveFolder(folder.key);
            }}
          >
            <span className="tree-kebab-remove-icon">×</span> Remove
          </button>
        </div>
      )}
    </span>
  );
}

// Which third (or half, for files) of a row the pointer is over — "before"/
// "after" reorder this node among its current siblings, "inside" (folders
// only) nests the dragged node inside this one instead.
function computeDropZone(e, isFolder, isRoot) {
  if (isRoot) return "inside";
  if (!isFolder) {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY - rect.top < rect.height / 2 ? "before" : "after";
  }
  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = (e.clientY - rect.top) / rect.height;
  if (ratio < 0.25) return "before";
  if (ratio > 0.75) return "after";
  return "inside";
}

function Node({
  node,
  index,
  path,
  onSelectFile,
  selectedHandle,
  actions,
  expandedPaths,
  onToggleOpen,
  onHide,
  onDropNode,
  dragKeyRef,
  dropTarget,
  setDropTarget,
}) {
  const isRoot = node.parentKey === null;
  const isFolder = node.kind === "directory";
  const zone = dropTarget?.key === node.key ? dropTarget.zone : null;

  function handleDragStart(e) {
    e.stopPropagation();
    dragKeyRef.current = node.key;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() {
    dragKeyRef.current = null;
    setDropTarget(null);
  }

  function handleDragOver(e) {
    if (!dragKeyRef.current || dragKeyRef.current === node.key) return;
    e.preventDefault();
    e.stopPropagation();
    setDropTarget({ key: node.key, zone: computeDropZone(e, isFolder, isRoot) });
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const draggedKey = dragKeyRef.current;
    dragKeyRef.current = null;
    setDropTarget(null);
    if (!draggedKey || draggedKey === node.key) return;
    const dropZone = computeDropZone(e, isFolder, isRoot);
    if (dropZone === "inside") {
      onDropNode(draggedKey, node.key, node.children.length);
    } else if (node.parentKey !== null) {
      onDropNode(draggedKey, node.parentKey, dropZone === "before" ? index : index + 1);
    }
  }

  if (node.kind === "file") {
    const isSelected = node.handle === selectedHandle;
    return (
      <div
        className={`tree-file${isSelected ? " selected" : ""}${zone ? ` drop-${zone}` : ""}`}
        onClick={() => onSelectFile(node.handle)}
        title={node.name}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <span className="tree-chevron" />
        <FileIcon />
        <span className="tree-label">{node.name}</span>
        <button
          className="tree-hide-btn"
          title={`Remove "${node.name}" from view`}
          aria-label={`Remove "${node.name}" from view`}
          onClick={(e) => {
            e.stopPropagation();
            onHide(node);
          }}
        >
          ×
        </button>
      </div>
    );
  }

  const isOpen = expandedPaths.has(path);

  return (
    <div className="tree-folder">
      <div
        className={`tree-folder-label${zone ? ` drop-${zone}` : ""}`}
        onClick={() => onToggleOpen(path)}
        title={node.name}
        draggable={!isRoot}
        onDragStart={isRoot ? undefined : handleDragStart}
        onDragEnd={isRoot ? undefined : handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <span className="tree-chevron">{isOpen ? "▾" : "▸"}</span>
        <FolderIcon />
        <span className="tree-label">{node.name}</span>
        {!isRoot && (
          <button
            className="tree-hide-btn"
            title={`Remove "${node.name}" from view`}
            aria-label={`Remove "${node.name}" from view`}
            onClick={(e) => {
              e.stopPropagation();
              onHide(node);
            }}
          >
            ×
          </button>
        )}
      </div>
      {/* Root folders only (actions is undefined for nested subfolders) — its
          own line so the name above never shifts based on chip/menu width. */}
      {actions && <div className="tree-folder-meta">{actions}</div>}
      {isOpen && (
        <div className="tree-children">
          {node.children.map((child, childIndex) => (
            <Node
              key={child.key}
              node={child}
              index={childIndex}
              path={`${path}/${child.name}`}
              onSelectFile={onSelectFile}
              selectedHandle={selectedHandle}
              expandedPaths={expandedPaths}
              onToggleOpen={onToggleOpen}
              onHide={onHide}
              onDropNode={onDropNode}
              dragKeyRef={dragKeyRef}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TreeView({
  folders,
  onSelectFile,
  selectedHandle,
  onRemoveFolder,
  onRefreshFolder,
  refreshingKeys,
  onFilesRemovedFromView,
}) {
  // Only one folder's actions menu open at a time.
  const [openActionsKey, setOpenActionsKey] = useState(null);
  const [expandedPaths, setExpandedPaths] = useState(() => new Set());
  // Guards the persist-effect below from firing (with the empty default
  // above) before the saved set has loaded, which would otherwise clobber it.
  const expandedLoadedRef = useRef(false);

  // Hide/reorder/move layer — see treeOverlay.js. Purely virtual: never
  // touches the real folders on disk, only how they're displayed here.
  const [overlay, setOverlay] = useState(emptyOverlay);
  const overlayLoadedRef = useRef(false);
  // Set (not state) so a drag reads the same value it started with even
  // through the many dragover events fired mid-drag.
  const dragKeyRef = useRef(null);
  const [dropTarget, setDropTarget] = useState(null);

  useEffect(() => {
    (async () => {
      const saved = await dbGet("expandedFolders");
      if (Array.isArray(saved)) setExpandedPaths(new Set(saved));
      expandedLoadedRef.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!expandedLoadedRef.current) return;
    dbSet("expandedFolders", [...expandedPaths]);
  }, [expandedPaths]);

  useEffect(() => {
    (async () => {
      const saved = await dbGet("treeOverlay");
      if (saved) setOverlay(saved);
      overlayLoadedRef.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!overlayLoadedRef.current) return;
    dbSet("treeOverlay", overlay);
  }, [overlay]);

  const toggleOpen = (path) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const displayFolders = useMemo(() => applyOverlay(folders, overlay), [folders, overlay]);

  function handleHide(node) {
    setOverlay((prev) => ({ ...prev, hidden: [...prev.hidden, node.key] }));
    onFilesRemovedFromView(collectFileHandles(node));
  }

  function handleDropNode(draggedKey, targetParentKey, index) {
    const nodesByKey = flattenByKey(displayFolders);
    const targetParent = nodesByKey.get(targetParentKey);
    if (!targetParent) return;
    // Refuse to drop a folder into itself or one of its own descendants.
    let cur = targetParent;
    while (cur) {
      if (cur.key === draggedKey) return;
      cur = cur.parentKey ? nodesByKey.get(cur.parentKey) : null;
    }
    const siblingKeys = targetParent.children.map((c) => c.key).filter((k) => k !== draggedKey);
    siblingKeys.splice(index, 0, draggedKey);
    setOverlay((prev) => ({
      ...prev,
      moves: { ...prev.moves, [draggedKey]: targetParentKey },
      order: { ...prev.order, [targetParentKey]: siblingKeys },
    }));
  }

  if (!folders.length) return null;

  return (
    <div className="tree-view">
      <div className="tree-rows">
        {displayFolders.map(
          (folder) =>
            folder.tree && (
              <Node
                key={folder.key}
                node={folder.tree}
                index={0}
                path={folder.tree.name}
                onSelectFile={onSelectFile}
                selectedHandle={selectedHandle}
                expandedPaths={expandedPaths}
                onToggleOpen={toggleOpen}
                onHide={handleHide}
                onDropNode={handleDropNode}
                dragKeyRef={dragKeyRef}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
                actions={
                  <FolderActions
                    folder={folder}
                    isOpen={openActionsKey === folder.key}
                    onToggle={() => setOpenActionsKey((k) => (k === folder.key ? null : folder.key))}
                    onClose={() => setOpenActionsKey(null)}
                    onRefreshFolder={onRefreshFolder}
                    onRemoveFolder={onRemoveFolder}
                    isRefreshing={refreshingKeys.has(folder.key)}
                  />
                }
              />
            )
        )}
      </div>
    </div>
  );
}
