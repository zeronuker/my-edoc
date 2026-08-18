// Applies a persisted, purely virtual layer (hide / reorder / move-between-
// folders) on top of the trees scanDirectory/buildTreeFromFileList produce
// straight off disk. Never touches the real filesystem — re-applied after
// every rescan/refresh, so a hidden or moved node stays hidden/moved even
// once the raw scan brings it back in its original spot.

export const emptyOverlay = { hidden: [], moves: {}, order: {} };

export function makeNodeKey(folderKey, relPath) {
  return `${folderKey}:${relPath}`;
}

// Walks up parentKey links to check whether `candidate` is `node` itself or
// one of its descendants — used to reject a move that would drop a folder
// inside its own subtree.
function isSelfOrDescendant(candidate, node, nodesByKey) {
  let cur = candidate;
  while (cur) {
    if (cur === node) return true;
    cur = cur.parentKey ? nodesByKey.get(cur.parentKey) : null;
  }
  return false;
}

export function applyOverlay(folders, overlay) {
  const hidden = new Set(overlay.hidden || []);
  const moves = overlay.moves || {};
  const order = overlay.order || {};
  const nodesByKey = new Map();

  function clone(node, relPath, folderKey, parentKey) {
    const key = makeNodeKey(folderKey, relPath);
    const out = { name: node.name, kind: node.kind, handle: node.handle, children: [], key, parentKey };
    nodesByKey.set(key, out);
    if (node.kind === "directory") {
      for (const child of node.children) {
        clone(child, relPath ? `${relPath}/${child.name}` : child.name, folderKey, key);
      }
    }
    return out;
  }

  const rootByFolderKey = new Map();
  for (const folder of folders) {
    if (folder.tree) rootByFolderKey.set(folder.key, clone(folder.tree, "", folder.key, null));
  }

  // Reparent per saved moves, skipping anything that would create a cycle
  // or whose source/target no longer exists (folder removed, node deleted,
  // or the target folder itself since a root can't be moved).
  for (const [key, newParentKey] of Object.entries(moves)) {
    const node = nodesByKey.get(key);
    const newParent = nodesByKey.get(newParentKey);
    if (!node || !newParent || newParent.kind !== "directory" || node.parentKey === null) continue;
    if (isSelfOrDescendant(newParent, node, nodesByKey)) continue;
    node.parentKey = newParentKey;
  }

  // Effective hidden = explicitly hidden, or a descendant of a hidden node.
  const effectivelyHidden = new Set();
  function isHidden(node) {
    if (effectivelyHidden.has(node.key)) return true;
    if (hidden.has(node.key)) {
      effectivelyHidden.add(node.key);
      return true;
    }
    if (node.parentKey && isHidden(nodesByKey.get(node.parentKey))) {
      effectivelyHidden.add(node.key);
      return true;
    }
    return false;
  }

  // Rebuild every children[] from the (possibly reparented) links above,
  // skipping hidden nodes entirely.
  for (const node of nodesByKey.values()) {
    if (node.parentKey === null || isHidden(node)) continue;
    const parent = nodesByKey.get(node.parentKey);
    if (parent && !isHidden(parent)) parent.children.push(node);
  }

  for (const node of nodesByKey.values()) {
    const orderList = order[node.key];
    if (!orderList || node.children.length < 2) continue;
    node.children.sort((a, b) => {
      const ia = orderList.indexOf(a.key);
      const ib = orderList.indexOf(b.key);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }

  return folders.map((folder) => {
    const root = rootByFolderKey.get(folder.key);
    return root ? { ...folder, tree: root } : folder;
  });
}

// Flat key -> node lookup over an already-overlaid folders array (i.e. the
// output of applyOverlay), used when computing where a drop landed.
export function flattenByKey(displayFolders) {
  const map = new Map();
  function walk(node) {
    map.set(node.key, node);
    node.children.forEach(walk);
  }
  for (const folder of displayFolders) if (folder.tree) walk(folder.tree);
  return map;
}

// File handles of a node's own leaves (itself if it's a file, every file
// under it if it's a folder) — used to close the open document if it was
// just hidden from view.
export function collectFileHandles(node) {
  const out = [];
  function walk(n) {
    if (n.kind === "file") out.push(n.handle);
    else n.children.forEach(walk);
  }
  walk(node);
  return out;
}
