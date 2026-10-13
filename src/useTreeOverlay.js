import { useEffect, useMemo, useRef, useState } from "react";
import { dbGet, dbSet } from "./db.js";
import { applyOverlay, emptyOverlay, flattenByKey, releaseNestedRoots, unhideKeys } from "./treeOverlay.js";

// Owns the "hide / move / reorder" virtual layer on top of the real folder
// trees — see treeOverlay.js. Shared by both TreeView (which renders it and
// lets the user edit it) and search (which needs the same filtered/reordered
// view so a hidden file doesn't still show up as a result) — previously this
// lived only inside TreeView, so nothing else could see it.
export function useTreeOverlay(folders) {
  const [overlay, setOverlay] = useState(emptyOverlay);
  const overlayLoadedRef = useRef(false);

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

  // allDisplayFolders keeps every connected folder (a nested one is flagged
  // `nested`); displayFolders is just the top-level rows, since a nested
  // folder is drawn inside its parent's tree rather than on its own.
  const allDisplayFolders = useMemo(() => applyOverlay(folders, overlay), [folders, overlay]);
  const displayFolders = useMemo(() => allDisplayFolders.filter((f) => !f.nested), [allDisplayFolders]);

  // Just the overlay mutation — callers that need to also react to a file
  // being hidden (e.g. closing it if it was the open document) do that
  // themselves; this hook has no notion of "the open document".
  function hideNode(node) {
    setOverlay((prev) => ({ ...prev, hidden: [...prev.hidden, node.key] }));
  }

  // Puts a connected folder's root inside `parentKey` (a node key), or back
  // at the top level when parentKey is null — also what clears a stale
  // placement when a same-named folder is re-added or removed.
  function placeRoot(rootKey, parentKey) {
    setOverlay((prev) => {
      const moves = { ...prev.moves };
      if (parentKey) moves[rootKey] = parentKey;
      else delete moves[rootKey];
      return { ...prev, moves };
    });
  }

  function releaseNested(parentName) {
    setOverlay((prev) => releaseNestedRoots(prev, parentName));
  }

  function unhideNodes(keys) {
    setOverlay((prev) => unhideKeys(prev, keys));
  }

  function dropNode(draggedKey, targetParentKey, index) {
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

  return { displayFolders, allDisplayFolders, hideNode, unhideNodes, placeRoot, releaseNested, dropNode };
}
