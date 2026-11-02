import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { dbGet, dbSet } from "./db.js";
import { IconStarFilled } from "@tabler/icons-react";
import { folderLevelColor, fileLevelColor, STAR_COLORS } from "./appHelpers.js";
import { extrasKey } from "./fileSystem.js";
import ManageBar from "./ManageBar.jsx";

// A folder draws this many of its children at a time, with a row to reveal
// the next batch. Drawing (and fitting the name of) every row of a folder
// holding thousands of files made opening it crawl.
const CHILD_PAGE = 200;

export function FolderIcon() {
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
      <path d="M5 8.2h6M5 10.4h6M5 12.6h3.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

// One guide-rail cell per ancestor level, plus this row's own corner
// (├ with more siblings below, └ for the last one) — see .tree-rail in
// App.css for how these render as one continuous line rather than a
// dashed one. ancestorsLast[i] is whether ancestor level i+1 has no more
// siblings coming (so its passthrough lane should stay blank instead of
// carrying a line past this row).
export function TreeRail({ ancestorsLast, isLast }) {
  return (
    <span className="tree-rail">
      {ancestorsLast.map((ancestorIsLast, i) => (
        <span className="tree-rail-cell" key={i}>
          {!ancestorIsLast && <span className="tree-rail-line-full" />}
        </span>
      ))}
      <span className="tree-rail-cell">
        <span className="tree-rail-line-top" />
        {!isLast && <span className="tree-rail-line-bottom" />}
        <span className="tree-rail-horiz" />
      </span>
    </span>
  );
}

// Binary-searches the longest "head…tail" form of `name` that still fits
// within 2 lines at the label's actual current width, replacing the middle
// with "…" only when the full name doesn't fit — keeps both the start and
// the extension visible instead of just truncating the end, which is what
// actually differs between two files that share a long common prefix.
// Re-measures on resize (sidebar collapse/expand, phone rotation, ...).
function TreeLabel({ name }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function fit() {
      el.textContent = name;
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 16;
      const maxHeight = lineHeight * 2 + 1;
      const overflow = () => el.scrollHeight - maxHeight;
      if (overflow() <= 0) return;

      function build(budget) {
        if (budget >= name.length) return name;
        const headLen = Math.ceil(budget * 0.55);
        const tailLen = budget - headLen;
        return name.slice(0, headLen) + "…" + (tailLen > 0 ? name.slice(name.length - tailLen) : "");
      }

      let lo = 0;
      let hi = name.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi + 1) / 2);
        el.textContent = build(mid);
        if (overflow() <= 0) lo = mid;
        else hi = mid - 1;
      }
      el.textContent = build(lo);
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [name]);

  return <span className="tree-label" ref={ref} />;
}

// Shown at the start of every row while Manage mode is on. Its click is its
// own — it must not also open the file or toggle the folder.
function SelectBox({ checked, onToggle, name }) {
  return (
    <input
      type="checkbox"
      className="tree-select-box"
      checked={checked}
      aria-label={`Select "${name}"`}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function Node({
  node,
  path,
  depth,
  ancestorsLast,
  isLast,
  onSelectFile,
  selectedHandle,
  expandedPaths,
  onToggleOpen,
  newKeys,
  onSeen,
  manageMode,
  checkedKeys,
  onToggleCheck,
  stars,
}) {
  const [shown, setShown] = useState(CHILD_PAGE);
  const starId = node.kind === "file" ? stars[extrasKey(node.handle)] : null;
  const star = starId ? STAR_COLORS.find((c) => c.id === starId)?.color : null;
  const newChip = newKeys.has(node.key) && <span className="tree-new-chip">NEW</span>;
  const selectBox = manageMode && (
    <SelectBox checked={checkedKeys.has(node.key)} onToggle={() => onToggleCheck(node.key)} name={node.name} />
  );

  if (node.kind === "file") {
    const isSelected = node.handle === selectedHandle;
    return (
      <div
        className={`tree-file${isSelected ? " selected" : ""}`}
        onClick={() => onSelectFile(node.handle)}
        title={node.name}
        style={{ "--level-color": fileLevelColor(depth) }}
      >
        {depth > 0 && <TreeRail ancestorsLast={ancestorsLast} isLast={isLast} />}
        {selectBox}
        <FileIcon />
        <TreeLabel name={node.name} />
        {star && <IconStarFilled className="tree-star" size={12} style={{ color: star }} aria-label="Starred" />}
        {newChip}
      </div>
    );
  }

  const isOpen = expandedPaths.has(path);

  return (
    <div className="tree-folder">
      <div
        className="tree-folder-label"
        onClick={() => {
          onToggleOpen(path);
          onSeen(node.key);
        }}
        title={node.name}
        style={{ "--level-color": folderLevelColor(depth) }}
      >
        {depth > 0 && <TreeRail ancestorsLast={ancestorsLast} isLast={isLast} />}
        {selectBox}
        <FolderIcon />
        <TreeLabel name={node.name} />
        {newChip}
      </div>
      {isOpen && (
        <div className="tree-children">
          {node.children.slice(0, shown).map((child, childIndex) => (
            <Node
              key={child.key}
              node={child}
              path={`${path}/${child.rawName}`}
              depth={depth + 1}
              ancestorsLast={[...ancestorsLast, isLast]}
              isLast={childIndex === node.children.length - 1}
              onSelectFile={onSelectFile}
              selectedHandle={selectedHandle}
              expandedPaths={expandedPaths}
              onToggleOpen={onToggleOpen}
              newKeys={newKeys}
              onSeen={onSeen}
              manageMode={manageMode}
              checkedKeys={checkedKeys}
              onToggleCheck={onToggleCheck}
              stars={stars}
            />
          ))}
          {node.children.length > shown && (
            <div
              className="tree-file tree-show-more"
              role="button"
              tabIndex={0}
              onClick={() => setShown((n) => n + CHILD_PAGE)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setShown((n) => n + CHILD_PAGE);
                }
              }}
              style={{ "--level-color": fileLevelColor(depth + 1) }}
            >
              <TreeRail ancestorsLast={[...ancestorsLast, isLast]} isLast />
              <span className="tree-label">
                Show {Math.min(CHILD_PAGE, node.children.length - shown)} more ({node.children.length - shown} left)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TreeView({
  displayFolders,
  onSelectFile,
  selectedHandle,
  newKeys,
  onSeen,
  manageMode,
  onDeleteNodes,
  onRenameNode,
  onMoveNodes,
  onCopyNodes,
  onRotateNode,
  onFlattenNode,
  onStarNodes,
  onProtectNode,
  stars,
}) {
  const [expandedPaths, setExpandedPaths] = useState(() => new Set());
  // Guards the persist-effect below from firing (with the empty default
  // above) before the saved set has loaded, which would otherwise clobber it.
  const expandedLoadedRef = useRef(false);
  const [checkedKeys, setCheckedKeys] = useState(() => new Set());

  // Leaving Manage mode forgets what was ticked.
  useEffect(() => {
    if (!manageMode) setCheckedKeys(new Set());
  }, [manageMode]);

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

  const toggleCheck = (key) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Every row currently on screen: the roots, plus the contents of whatever
  // is expanded.
  function selectAll() {
    const keys = new Set();
    const walk = (node, path) => {
      keys.add(node.key);
      if (node.kind === "directory" && expandedPaths.has(path)) {
        node.children.forEach((c) => walk(c, `${path}/${c.rawName}`));
      }
    };
    displayFolders.forEach((f) => f.tree && walk(f.tree, f.tree.rawName));
    setCheckedKeys(keys);
  }

  // The ticked nodes, in tree order.
  function checkedNodes() {
    const out = [];
    const walk = (node) => {
      if (checkedKeys.has(node.key)) out.push(node);
      node.children.forEach(walk);
    };
    displayFolders.forEach((f) => f.tree && walk(f.tree));
    return out;
  }

  if (!displayFolders.length) return null;
  const ticked = manageMode ? checkedNodes() : [];

  return (
    <div className="tree-view">
      <div className="tree-rows">
        {displayFolders.map(
          (folder, folderIndex) =>
            folder.tree && (
              <Node
                key={folder.key}
                node={folder.tree}
                // ponytail: folder.key is a fresh random id every load, so
                // expand-state must key off the folder name instead to
                // survive a reload/reupload. Two root folders sharing a
                // name will share expand-state; fine until that's reported.
                path={folder.tree.rawName}
                depth={0}
                ancestorsLast={[]}
                isLast={folderIndex === displayFolders.length - 1}
                onSelectFile={onSelectFile}
                selectedHandle={selectedHandle}
                expandedPaths={expandedPaths}
                onToggleOpen={toggleOpen}
                newKeys={newKeys}
                onSeen={onSeen}
                manageMode={manageMode}
                checkedKeys={checkedKeys}
                onToggleCheck={toggleCheck}
                stars={stars}
              />
            )
        )}
      </div>
      {manageMode && (
        <ManageBar
          count={checkedKeys.size}
          fileTools={ticked.length === 1 && ticked[0].kind === "file"}
          canStar={ticked.length > 0 && ticked.every((n) => n.kind === "file")}
          onStar={(colorId) => onStarNodes(ticked, colorId)}
          onProtect={() => onProtectNode(ticked[0], () => setCheckedKeys(new Set()))}
          onRotate={() => onRotateNode(ticked[0], () => setCheckedKeys(new Set()))}
          onFlatten={() => onFlattenNode(ticked[0], () => setCheckedKeys(new Set()))}
          onSelectAll={selectAll}
          onDeselectAll={() => setCheckedKeys(new Set())}
          onRename={() => onRenameNode(ticked[0])}
          onCopy={() => onCopyNodes(ticked, () => setCheckedKeys(new Set()))}
          onMove={() => onMoveNodes(ticked, () => setCheckedKeys(new Set()))}
          onDelete={() => onDeleteNodes(ticked)}
        />
      )}
    </div>
  );
}
