// Applies a persisted, purely virtual layer (reorder / move-between-folders /
// folders placed inside others) on top of the trees scanDirectory/
// buildTreeFromFileList produce. Never touches the real filesystem —
// re-applied after every load, so a moved node stays moved even once the raw
// scan brings it back in its original spot. (There is no "hidden" any more:
// removing something removes it from the app for good — see App.jsx.)

export const emptyOverlay = { moves: {}, order: {} };

export function makeNodeKey(folderKey, relPath) {
  return `${folderKey}:${relPath}`;
}

// Drops the placement of every connected folder that was shown inside the
// folder named `parentName` (a root key ends in ":", see makeNodeKey) —
// used when that folder is removed, so they stay at the top level instead
// of jumping back inside it if a same-named folder is added again later.
export function releaseNestedRoots(overlay, parentName) {
  const moves = {};
  for (const [key, target] of Object.entries(overlay.moves || {})) {
    if (key.endsWith(":") && target.startsWith(`${parentName}:`)) continue;
    moves[key] = target;
  }
  return { ...overlay, moves };
}

// Inverse of makeNodeKey: which connected folder (by its root name) a node
// key belongs to, and the node's path inside it — i.e. where it physically
// lives, regardless of where the overlay moved it to in the displayed tree.
// Longest root name wins so "Lib" doesn't swallow a key of "Lib:Old". Null
// if no root matches.
export function parseNodeKey(key, rootNames) {
  let best = null;
  for (const name of rootNames) {
    if (key.startsWith(`${name}:`) && (best === null || name.length > best.length)) best = name;
  }
  return best === null ? null : { rootName: best, relPath: key.slice(best.length + 1) };
}

// One-time migration: the old "hidden" list (node keys) turned into the
// paths to remove for good from each connected folder, [{ rootName,
// relPaths }]. Keys no connected folder owns are dropped, and a path whose
// ancestor is also listed is dropped since removing the ancestor covers it.
export function hiddenRemovals(hiddenKeys, rootNames) {
  const byRoot = new Map();
  for (const key of hiddenKeys) {
    const parsed = parseNodeKey(key, rootNames);
    if (!parsed || !parsed.relPath) continue;
    if (!byRoot.has(parsed.rootName)) byRoot.set(parsed.rootName, new Set());
    byRoot.get(parsed.rootName).add(parsed.relPath);
  }
  return [...byRoot].map(([rootName, paths]) => ({
    rootName,
    relPaths: [...paths].filter((p) => ![...paths].some((q) => q !== p && p.startsWith(`${q}/`))),
  }));
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

  // Keyed by the folder's own name, not folder.key — folder.key is a fresh
  // random id regenerated every app launch (see App.jsx's load effect), so
  // a saved overlay keyed by it could never match on the next reload. The
  // name is stable across reloads/re-adds instead, at the cost of two
  // differently-connected folders sharing the same name also sharing
  // overlay state — the same tradeoff already accepted for expand-state
  // persistence (see TreeView.jsx).
  const rootByFolderKey = new Map();
  for (const folder of folders) {
    if (!folder.tree) continue;
    const root = clone(folder.tree, "", folder.tree.name, null);
    // The connected folder this root belongs to — lets the tree tell a
    // folder's own root (which has a × that removes the whole folder) from
    // a subfolder, even when it's been placed inside another folder.
    root.folderRef = folder;
    rootByFolderKey.set(folder.tree.name, root);
  }

  // Reparent per saved moves, skipping anything that would create a cycle
  // or whose source/target no longer exists (folder removed, node deleted).
  // A connected folder's root can be moved too — that's how a folder added
  // "inside" another one is shown there while staying its own folder.
  for (const [key, newParentKey] of Object.entries(moves)) {
    const node = nodesByKey.get(key);
    const newParent = nodesByKey.get(newParentKey);
    if (!node || !newParent || newParent.kind !== "directory") continue;
    if (isSelfOrDescendant(newParent, node, nodesByKey)) continue;
    node.parentKey = newParentKey;
  }

  // Rebuild every children[] from the (possibly reparented) links above.
  for (const node of nodesByKey.values()) {
    if (node.parentKey === null) continue;
    nodesByKey.get(node.parentKey)?.children.push(node);
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

  // `nested` marks a root that ended up inside another folder: it's drawn
  // there (as part of that folder's tree), not as a top-level row.
  return folders.map((folder) => {
    const root = folder.tree ? rootByFolderKey.get(folder.tree.name) : undefined;
    return root ? { ...folder, tree: root, nested: root.parentKey !== null } : folder;
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

// "Contracts › Signed › 2025" for the node with this key, from the
// displayed trees (nested folders are found through their parent).
export function displayedPath(folders, nodeKey) {
  function walk(node, trail) {
    const next = [...trail, node.name];
    if (node.key === nodeKey) return next;
    for (const c of node.children) {
      if (c.kind !== "directory") continue;
      const hit = walk(c, next);
      if (hit) return hit;
    }
    return null;
  }
  for (const f of folders) {
    const hit = walk(f.tree, []);
    if (hit) return hit;
  }
  return [];
}

// Keys of every node from a top-level folder's root down to `nodeKey`
// (itself included), or [] if it isn't in the displayed trees — what has to
// be open for that node to be visible.
export function pathKeys(folders, nodeKey) {
  function walk(node, trail) {
    const next = [...trail, node.key];
    if (node.key === nodeKey) return next;
    for (const c of node.children) {
      if (c.kind !== "directory") continue;
      const hit = walk(c, next);
      if (hit) return hit;
    }
    return null;
  }
  for (const f of folders) {
    const hit = walk(f.tree, []);
    if (hit) return hit;
  }
  return [];
}

// Every node key in a displayed subtree, the node itself included — what a
// folder being moved can't be moved into (itself and what it holds).
export function subtreeKeys(node) {
  const keys = new Set();
  (function walk(n) {
    keys.add(n.key);
    n.children.forEach(walk);
  })(node);
  return keys;
}
