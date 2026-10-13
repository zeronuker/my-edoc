import { useEffect, useMemo, useRef, useState } from "react";
import { dbGet, dbSet } from "./db.js";
import { applyOverlay, emptyOverlay, flattenByKey, releaseNestedRoots } from "./treeOverlay.js";

// Owns the "move / reorder / placed inside another folder" virtual layer on
// top of the real folder trees — see treeOverlay.js. Shared by both TreeView
// (which renders it and lets the user edit it) and search (which needs the
// same arranged view so results show where things are drawn).
//
// legacyHidden carries the old "hidden" list from before hiding was removed.
// It is kept in storage until App.jsx has removed those items for good and
// calls clearLegacyHidden, so an app closed halfway just redoes the
// (idempotent) clean-up on the next launch.
export function useTreeOverlay(folders) {
  const [overlay, setOverlay] = useState(emptyOverlay);
  const [legacyHidden, setLegacyHidden] = useState([]);
  const overlayLoadedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const saved = await dbGet("treeOverlay");
      if (saved) {
        const { hidden, ...rest } = saved;
        setOverlay({ ...emptyOverlay, ...rest });
        if (hidden?.length) setLegacyHidden(hidden);
      }
      overlayLoadedRef.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!overlayLoadedRef.current) return;
    dbSet("treeOverlay", legacyHidden.length ? { ...overlay, hidden: legacyHidden } : overlay);
  }, [overlay, legacyHidden]);

  // allDisplayFolders keeps every connected folder (a nested one is flagged
  // `nested`); displayFolders is just the top-level rows, since a nested
  // folder is drawn inside its parent's tree rather than on its own.
  const allDisplayFolders = useMemo(() => applyOverlay(folders, overlay), [folders, overlay]);
  const displayFolders = useMemo(() => allDisplayFolders.filter((f) => !f.nested), [allDisplayFolders]);

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

  function clearLegacyHidden() {
    setLegacyHidden([]);
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

  return { displayFolders, allDisplayFolders, legacyHidden, clearLegacyHidden, placeRoot, releaseNested, dropNode };
}
