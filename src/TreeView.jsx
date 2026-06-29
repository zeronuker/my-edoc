import { useState } from "react";

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

export default function TreeView({ folders, onSelectFile, selectedHandle, onRemoveFolder }) {
  const [search, setSearch] = useState("");
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
        ({ dirHandle, tree }) =>
          tree && (
            <Node
              key={dirHandle.name}
              node={tree}
              onSelectFile={onSelectFile}
              selectedHandle={selectedHandle}
              query={query}
              actions={
                <button
                  className="tree-remove"
                  title={`Remove "${dirHandle.name}"`}
                  aria-label={`Remove "${dirHandle.name}"`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFolder(dirHandle);
                  }}
                >
                  ×
                </button>
              }
            />
          )
      )}
    </div>
  );
}
