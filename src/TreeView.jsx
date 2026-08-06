import { useEffect, useRef, useState } from "react";
import { dbGet, dbSet } from "./db.js";

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

function Node({ node, path, onSelectFile, selectedHandle, actions, expandedPaths, onToggleOpen }) {
  if (node.kind === "file") {
    const isSelected = node.handle === selectedHandle;
    return (
      <div
        className={`tree-file${isSelected ? " selected" : ""}`}
        onClick={() => onSelectFile(node.handle)}
        title={node.name}
      >
        <span className="tree-chevron" />
        <FileIcon />
        <span className="tree-label">{node.name}</span>
      </div>
    );
  }

  const isOpen = expandedPaths.has(path);

  return (
    <div className="tree-folder">
      <div className="tree-folder-label" onClick={() => onToggleOpen(path)} title={node.name}>
        <span className="tree-chevron">{isOpen ? "▾" : "▸"}</span>
        <FolderIcon />
        <span className="tree-label">{node.name}</span>
      </div>
      {/* Root folders only (actions is undefined for nested subfolders) — its
          own line so the name above never shifts based on chip/menu width. */}
      {actions && <div className="tree-folder-meta">{actions}</div>}
      {isOpen && (
        <div className="tree-children">
          {node.children.map((child) => (
            <Node
              key={child.name + child.kind}
              node={child}
              path={`${path}/${child.name}`}
              onSelectFile={onSelectFile}
              selectedHandle={selectedHandle}
              expandedPaths={expandedPaths}
              onToggleOpen={onToggleOpen}
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
}) {
  // Only one folder's actions menu open at a time.
  const [openActionsKey, setOpenActionsKey] = useState(null);
  const [expandedPaths, setExpandedPaths] = useState(() => new Set());
  // Guards the persist-effect below from firing (with the empty default
  // above) before the saved set has loaded, which would otherwise clobber it.
  const expandedLoadedRef = useRef(false);

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

  const toggleOpen = (path) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (!folders.length) return null;

  return (
    <div className="tree-view">
      <div className="tree-rows">
        {folders.map(
          (folder) =>
            folder.tree && (
              <Node
                key={folder.key}
                node={folder.tree}
                path={folder.tree.name}
                onSelectFile={onSelectFile}
                selectedHandle={selectedHandle}
                expandedPaths={expandedPaths}
                onToggleOpen={toggleOpen}
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
