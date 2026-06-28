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

function Node({ node, onSelectFile, selectedHandle }) {
  const [open, setOpen] = useState(false);

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

  return (
    <div className="tree-folder">
      <div className="tree-folder-label" onClick={() => setOpen(!open)} title={node.name}>
        <span className="tree-chevron">{open ? "▾" : "▸"}</span>
        <FolderIcon />
        <span className="tree-label">{node.name}</span>
      </div>
      {open && (
        <div className="tree-children">
          {node.children.map((child) => (
            <Node
              key={child.name + child.kind}
              node={child}
              onSelectFile={onSelectFile}
              selectedHandle={selectedHandle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TreeView({ root, onSelectFile, selectedHandle }) {
  if (!root) return null;
  return (
    <div className="tree-view">
      <Node node={root} onSelectFile={onSelectFile} selectedHandle={selectedHandle} />
    </div>
  );
}
