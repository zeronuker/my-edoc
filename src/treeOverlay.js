// Applies a persisted, purely virtual layer (reorder / move-between-folders /
// folders placed inside others) on top of the trees scanDirectory/
// buildTreeFromFileList produce. Never touches the real filesystem —
// re-applied after every load, so a moved node stays moved even once the raw
// scan brings it back in its original spot. (There is no "hidden" any more:
// removing something removes it from the app for good — see App.jsx.)

// names: node key -> display name the user gave it. Only what is drawn
// changes — the key, and so the bookmarks and annotations filed under it,
// stays the same.
export const emptyOverlay = { moves: {}, names: {} };

// by: "name" | "date" (added) | "size"; dir: "asc" | "desc".
export const defaultSort = { by: "name", dir: "asc" };

// Folders always come before files; within each, the chosen key, with the
// name breaking ties so equal sizes/dates stay in a stable order. dir only
// flips the chosen key, not the folders-first rule.
export function compareNodes(sort = defaultSort) {
  const sign = sort.dir === "desc" ? -1 : 1;
  return (a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    const key = sort.by === "date" ? a.addedAt - b.addedAt : sort.by === "size" ? a.size - b.size : 0;
    if (key) return sign * key;
    const byName = a.name.localeCompare(b.name);
    return sort.by === "name" ? sign * byName : byName;
  };
}

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

export function applyOverlay(folders, overlay, sort = defaultSort) {
  const moves = overlay.moves || {};
  const names = overlay.names || {};
  const nodesByKey = new Map();

  function clone(node, relPath, folderKey, parentKey, connectedAt) {
    const key = makeNodeKey(folderKey, relPath);
    // rawName is the real name — what expand-state paths are built from, so
    // renaming a folder doesn't collapse it. A file saved before dates were
    // kept counts as added when its folder was connected.
    const out = {
      name: names[key] ?? node.name,
      rawName: node.name,
      kind: node.kind,
      handle: node.handle,
      children: [],
      key,
      parentKey,
      size: node.size ?? 0,
      addedAt: node.addedAt ?? connectedAt,
    };
    nodesByKey.set(key, out);
    if (node.kind === "directory") {
      for (const child of node.children) {
        clone(child, relPath ? `${relPath}/${child.name}` : child.name, folderKey, key, connectedAt);
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
    const root = clone(folder.tree, "", folder.tree.name, null, folder.connectedAt ?? 0);
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

  // A folder weighs what is inside it and counts as added when its first
  // file was. Done after the moves so a moved subtree counts where it lands.
  function total(node) {
    if (node.kind === "file") return;
    node.size = 0;
    node.addedAt = Infinity;
    for (const child of node.children) {
      total(child);
      node.size += child.size;
      node.addedAt = Math.min(node.addedAt, child.addedAt);
    }
    if (node.children.length === 0) node.addedAt = 0;
  }
  const compare = compareNodes(sort);
  for (const node of nodesByKey.values()) {
    if (node.parentKey === null) total(node);
  }
  for (const node of nodesByKey.values()) node.children.sort(compare);

  // `nested` marks a root that ended up inside another folder: it's drawn
  // there (as part of that folder's tree), not as a top-level row.
  return folders.map((folder) => {
    const root = folder.tree ? rootByFolderKey.get(folder.tree.name) : undefined;
    return root ? { ...folder, tree: root, nested: root.parentKey !== null } : folder;
  });
}

// True if the node with key `key` is `ancestorKey` itself or sits anywhere
// inside it, going by the displayed tree (`byKey` is flattenByKey's map).
export function isInside(key, ancestorKey, byKey) {
  for (let cur = byKey.get(key); cur; cur = cur.parentKey ? byKey.get(cur.parentKey) : null) {
    if (cur.key === ancestorKey) return true;
  }
  return false;
}

// Sorts `moving` (displayed nodes) into the ones that can go into `dest`
// untouched and the ones whose name is already taken there. A clash's
// `existing` is a node already in dest, or — when `inBatch` — an earlier item
// of this same move. Names compare case-insensitively, like the rest of the
// app. dest is null for the top level, where nothing can clash. For a copy,
// `copying` counts the originals already sitting in dest too — copying a file
// next to itself clashes with it, where moving it there would do nothing.
export function planMove(moving, dest, copying = false) {
  const clean = [];
  const clashes = [];
  if (!dest) return { clean: [...moving], clashes };
  const movingKeys = new Set(moving.map((n) => n.key));
  const taken = new Map();
  for (const child of dest.children) {
    if (copying || !movingKeys.has(child.key)) taken.set(child.name.toLowerCase(), { node: child, inBatch: false });
  }
  for (const node of moving) {
    const hit = taken.get(node.name.toLowerCase());
    if (hit) {
      clashes.push({ incoming: node, existing: hit.node, inBatch: hit.inBatch });
    } else {
      clean.push(node);
      taken.set(node.name.toLowerCase(), { node, inBatch: true });
    }
  }
  return { clean, clashes };
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
