import { useEffect, useRef, useState } from "react";

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

function FileIcon() {
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

// "Updated just now" / "5m ago" / "3h ago" / "2d ago", from a connectedAt
// epoch-ms timestamp (null if never successfully connected/refreshed yet).
function formatRelativeTime(ms) {
  if (!ms) return null;
  const diff = Date.now() - ms;
  const minute = 60000;
  const hour = 3600000;
  const day = 86400000;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
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

// True if this node's own name matches, or (for a folder) any descendant
// does. query is already lowercased.
function nodeMatches(node, query) {
  if (!query) return true;
  if (node.name.toLowerCase().includes(query)) return true;
  if (node.kind === "directory") return node.children.some((c) => nodeMatches(c, query));
  return false;
}

function Node({ node, onSelectFile, selectedHandle, query, actions }) {
  const [open, setOpen] = useState(false);

  if (node.kind === "file") {
    if (!nodeMatches(node, query)) return null;
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

  if (!nodeMatches(node, query)) return null;
  const isOpen = query ? true : open;
  const children = query ? node.children.filter((c) => nodeMatches(c, query)) : node.children;

  return (
    <div className="tree-folder">
      <div className="tree-folder-label" onClick={() => setOpen(!open)} title={node.name}>
        <span className="tree-chevron">{isOpen ? "▾" : "▸"}</span>
        <FolderIcon />
        <span className="tree-label">{node.name}</span>
        {actions}
      </div>
      {isOpen && (
        <div className="tree-children">
          {children.map((child) => (
            <Node
              key={child.name + child.kind}
              node={child}
              onSelectFile={onSelectFile}
              selectedHandle={selectedHandle}
              query={query}
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
  const [search, setSearch] = useState("");
  // Only one folder's actions menu open at a time.
  const [openActionsKey, setOpenActionsKey] = useState(null);
  if (!folders.length) return null;
  const query = search.trim().toLowerCase();

  return (
    <div className="tree-view">
      <input
        type="text"
        className="tree-search"
        placeholder="Search files…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {folders.map(
        (folder) =>
          folder.tree && (
            <Node
              key={folder.key}
              node={folder.tree}
              onSelectFile={onSelectFile}
              selectedHandle={selectedHandle}
              query={query}
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
  );
}
