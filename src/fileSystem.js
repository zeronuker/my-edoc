import { writeLegacyFile, readLegacyFile } from "./opfs.js";

export function supportsDirectoryPicker() {
  return "showDirectoryPicker" in window;
}

export async function pickFolder() {
  return window.showDirectoryPicker();
}

// Recursively builds a tree of folders and .pdf files only.
export async function scanDirectory(dirHandle, name = dirHandle.name) {
  const children = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === "directory") {
      const subtree = await scanDirectory(entry, entry.name);
      if (subtree.children.length > 0) children.push(subtree);
    } else if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".pdf")) {
      children.push({ name: entry.name, kind: "file", handle: entry });
    }
  }
  children.sort((a, b) => a.name.localeCompare(b.name));
  return { name, kind: "directory", handle: dirHandle, children };
}

// ponytail: no live filesystem connection here, so there's nothing to
// re-grant permission to — queryPermission always reports "granted".
// The real limitation is no detection of files added/removed on disk
// after picking, since it's a one-time snapshot rather than a live handle.
function permissiveHandle(name, extra = {}) {
  // __legacy marks this for App.jsx: it carries function properties
  // (getFile/queryPermission), which IndexedDB can't structured-clone
  // directly — see writeLegacyFiles/buildLegacyManifest/reviveLegacyManifest
  // below for how these get persisted across reloads instead.
  return { name, __legacy: true, queryPermission: async () => "granted", ...extra };
}

// Wraps a single dropped File (from drag-and-drop) in the same permissive
// handle shape used by the legacy folder picker, so selectFile() can treat
// it identically regardless of how it was opened.
export function wrapDroppedFile(file) {
  return permissiveHandle(file.name, { getFile: async () => file });
}

// Safari/iOS has no File System Access API (no showDirectoryPicker), so
// folders there go through the older <input webkitdirectory> mechanism
// instead: a one-time flat file list with relative paths, which we
// rebuild into the same tree shape scanDirectory produces.
export function pickFolderLegacy() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.multiple = true;
    input.style.display = "none";
    input.addEventListener("change", () => {
      resolve(input.files);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      reject(new Error("Folder selection cancelled"));
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function buildTreeFromFileList(fileList) {
  const files = [...fileList].filter((f) => f.name.toLowerCase().endsWith(".pdf"));
  if (files.length === 0) return null;

  const rootName = files[0].webkitRelativePath.split("/")[0];
  const root = { name: rootName, kind: "directory", handle: permissiveHandle(rootName), children: [] };
  const dirsByPath = new Map([[rootName, root]]);

  for (const file of files) {
    const parts = file.webkitRelativePath.split("/");
    let parent = root;
    let pathSoFar = rootName;
    for (let i = 1; i < parts.length - 1; i++) {
      pathSoFar += "/" + parts[i];
      let dir = dirsByPath.get(pathSoFar);
      if (!dir) {
        dir = { name: parts[i], kind: "directory", children: [] };
        dirsByPath.set(pathSoFar, dir);
        parent.children.push(dir);
      }
      parent = dir;
    }
    // relativePath (path within the picked root, e.g. "Work/Q1.pdf") is
    // the OPFS lookup key — see writeLegacyFiles/buildLegacyManifest below.
    const relativePath = parts.slice(1).join("/");
    parent.children.push({
      name: file.name,
      kind: "file",
      relativePath,
      handle: permissiveHandle(file.name, { getFile: async () => file, file }),
    });
  }

  for (const dir of dirsByPath.values()) {
    dir.children.sort((a, b) => a.name.localeCompare(b.name));
  }
  return root;
}

// Writes every file in a freshly-picked legacy tree into its own OPFS
// subdirectory (folderId) — this is the actual persisted copy. Called once
// at connect time and once per refresh (into a *new* folderId — see
// App.jsx's handleRefreshFolder for why: write-the-new-copy-first is what
// lets a failed refresh leave the old copy intact).
export async function writeLegacyFiles(folderId, tree) {
  async function walk(node) {
    if (node.kind === "file") {
      await writeLegacyFile(folderId, node.relativePath, node.handle.file);
      return;
    }
    await Promise.all(node.children.map(walk));
  }
  await walk(tree);
}

// Sum of a legacy tree's file sizes, read straight off the in-memory File
// objects — used to track this folder's OPFS footprint ourselves, since
// navigator.storage.estimate()'s usage figure lags behind (WebKit doesn't
// update it immediately after a write/delete, sometimes not until the app
// is relaunched) and would otherwise make the storage display read wrong
// right after connecting/refreshing/removing a folder.
export function treeByteSize(tree) {
  function walk(node) {
    if (node.kind === "file") return node.handle.file.size;
    return node.children.reduce((sum, c) => sum + walk(c), 0);
  }
  return walk(tree);
}

// The lightweight, no-file-bytes description of a legacy tree's shape —
// this (not the files themselves) is what actually goes into IndexedDB.
export function buildLegacyManifest(tree) {
  function walk(node) {
    if (node.kind === "file") {
      return { name: node.name, kind: "file", relativePath: node.relativePath };
    }
    return { name: node.name, kind: "directory", children: node.children.map(walk) };
  }
  return walk(tree);
}

// Rebuilds the buildTreeFromFileList shape from a saved manifest, wiring
// each file's getFile() to read its bytes back out of OPFS on demand.
export function reviveLegacyManifest(folderId, manifest) {
  function walk(node) {
    if (node.kind === "file") {
      return {
        name: node.name,
        kind: "file",
        relativePath: node.relativePath,
        handle: permissiveHandle(node.name, { getFile: () => readLegacyFile(folderId, node.relativePath) }),
      };
    }
    return { name: node.name, kind: "directory", children: node.children.map(walk) };
  }
  const tree = walk(manifest);
  tree.handle = permissiveHandle(manifest.name);
  return tree;
}

// One-time migration path only: the very first version of legacy-folder
// persistence stored File blobs directly inside IndexedDB (see git history)
// instead of in OPFS. This revives that old shape back into an in-memory
// tree so App.jsx can re-save it through writeLegacyFiles/buildLegacyManifest
// and drop the old inline-blob copy for good.
export function reviveInlineLegacyFolder(serialized) {
  function walk(node, pathSoFar) {
    const relativePath = pathSoFar ? `${pathSoFar}/${node.name}` : node.name;
    if (node.kind === "file") {
      return {
        name: node.name,
        kind: "file",
        relativePath,
        handle: permissiveHandle(node.name, { getFile: async () => node.file, file: node.file }),
      };
    }
    return { name: node.name, kind: "directory", children: node.children.map((c) => walk(c, relativePath)) };
  }
  const tree = { name: serialized.name, kind: "directory", children: serialized.children.map((c) => walk(c, "")) };
  tree.handle = permissiveHandle(serialized.name);
  return tree;
}
