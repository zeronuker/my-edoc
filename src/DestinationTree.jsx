import { IconCheck, IconChevronRight } from "@tabler/icons-react";
import { FolderIcon, TreeRail } from "./TreeView.jsx";
import { folderLevelColor } from "./appHelpers.js";

function countFiles(node) {
  return node.kind === "file" ? 1 : node.children.reduce((sum, c) => sum + countFiles(c), 0);
}

function onEnterOrSpace(fn) {
  return (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };
}

// One folder row of a destination picker — same row, rail, colour and
// expand animation as the sidebar tree (folders only). Tapping the row picks
// it (and opens it, to show what's inside); the chevron only opens/closes.
function DestNode({
  node,
  depth,
  ancestorsLast,
  isLast,
  selectedKey,
  expanded,
  onSelect,
  onToggle,
  disabled,
  excludeKeys,
}) {
  const subfolders = node.children.filter((c) => c.kind === "directory" && !excludeKeys.has(c.key));
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
        onKeyDown={onEnterOrSpace(pick)}
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
              excludeKeys={excludeKeys}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// The folders-only picker used by both Add files and Add folder. `folders`
// is the top-level display folders ([{ key, tree }], tree = the overlaid
// root node). With `topLevelLabel`, a "no parent" row is offered first and
// is selected when selectedKey is null.
export default function DestinationTree({
  folders,
  selectedKey,
  expanded,
  onSelect,
  onToggle,
  disabled,
  topLevelLabel,
  ariaLabel,
  excludeKeys = new Set(),
}) {
  const shown = folders.filter((f) => !excludeKeys.has(f.tree.key));
  return (
    <div className="add-dest-tree" role="radiogroup" aria-label={ariaLabel}>
      {topLevelLabel && (
        <div
          className={`tree-folder-label add-dest-row${selectedKey === null ? " is-dest" : ""}`}
          style={{ "--level-color": "var(--cb-ink-dim)" }}
          role="radio"
          aria-checked={selectedKey === null}
          tabIndex={0}
          onClick={() => !disabled && onSelect(null)}
          onKeyDown={onEnterOrSpace(() => !disabled && onSelect(null))}
        >
          <span className="add-dest-chevron" />
          <FolderIcon />
          <span className="tree-label">{topLevelLabel}</span>
          {selectedKey === null && <IconCheck className="add-dest-check" size={14} aria-hidden="true" />}
        </div>
      )}
      {shown.map((f, i) => (
        <DestNode
          key={f.key}
          node={f.tree}
          depth={0}
          ancestorsLast={[]}
          isLast={i === shown.length - 1}
          selectedKey={selectedKey}
          expanded={expanded}
          onSelect={onSelect}
          onToggle={onToggle}
          disabled={disabled}
          excludeKeys={excludeKeys}
        />
      ))}
    </div>
  );
}
