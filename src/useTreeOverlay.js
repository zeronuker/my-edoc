import { useEffect, useMemo, useRef, useState } from "react";
import { dbGet, dbSet } from "./db.js";
import { applyOverlay, compareNodes, defaultSort, emptyOverlay, releaseNestedRoots } from "./treeOverlay.js";

// Owns the "rename / move / placed inside another folder" virtual layer and
// the sort order on top of the real folder trees — see treeOverlay.js.
// Shared by both TreeView
// (which renders it and lets the user edit it) and search (which needs the
// same arranged view so results show where things are drawn).
export function useTreeOverlay(folders) {
  const [overlay, setOverlay] = useState(emptyOverlay);
  const overlayLoadedRef = useRef(false);
  const [sort, setSortState] = useState(defaultSort);

  useEffect(() => {
    (async () => {
      const saved = await dbGet("treeOverlay");
      if (saved) setOverlay({ ...emptyOverlay, ...saved });
      overlayLoadedRef.current = true;
      const savedSort = await dbGet("treeSort");
      if (savedSort) setSortState(savedSort);
    })();
  }, []);

  function setSort(next) {
    setSortState(next);
    dbSet("treeSort", next);
  }

  useEffect(() => {
    if (!overlayLoadedRef.current) return;
    dbSet("treeOverlay", overlay);
  }, [overlay]);

  // allDisplayFolders keeps every connected folder (a nested one is flagged
  // `nested`); displayFolders is just the top-level rows, since a nested
  // folder is drawn inside its parent's tree rather than on its own.
  const allDisplayFolders = useMemo(() => applyOverlay(folders, overlay, sort), [folders, overlay, sort]);
  const displayFolders = useMemo(
    () => {
      const compare = compareNodes(sort);
      return allDisplayFolders.filter((f) => !f.nested).sort((a, b) => (a.tree && b.tree ? compare(a.tree, b.tree) : 0));
    },
    [allDisplayFolders, sort]
  );

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

  // An empty name puts the original back.
  function renameNode(key, name) {
    setOverlay((prev) => {
      const names = { ...prev.names };
      if (name) names[key] = name;
      else delete names[key];
      return { ...prev, names };
    });
  }

  // entries: [{ key, destKey, name? }] — destKey is a folder's node key, or
  // null to put a connected folder back at the top level; name (optional) is
  // the new display name when the item arrives as "x (1)".
  function moveNodes(entries) {
    setOverlay((prev) => {
      const moves = { ...prev.moves };
      const names = { ...prev.names };
      for (const { key, destKey, name } of entries) {
        if (destKey) moves[key] = destKey;
        else delete moves[key];
        if (name) names[key] = name;
      }
      return { ...prev, moves, names };
    });
  }

  return { displayFolders, allDisplayFolders, placeRoot, releaseNested, renameNode, moveNodes, sort, setSort };
}
