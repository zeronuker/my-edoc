import { useState } from "react";

function Node({ node, onSelectFile, selectedHandle }) {
  const [open, setOpen] = useState(true);

  if (node.kind === "file") {
    const isSelected = node.handle === selectedHandle;
    return (
      <div
        className={`tree-file${isSelected ? " selected" : ""}`}
        onClick={() => onSelectFile(node.handle)}
      >
        {node.name}
      </div>
    );
  }

  return (
    <div className="tree-folder">
      <div className="tree-folder-label" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {node.name}
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
