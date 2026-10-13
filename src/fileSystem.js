import { writeLegacyFile, readLegacyFile } from "./opfs.js";

// True only for an actual phone, not a tablet. iPhone/iPod always
// self-identify in the UA; real Android phones carry a "Mobile" token that
// Android tablets omit. (iPadOS masquerades as a desktop Mac UA by default,
// so there's no reliable UA signal to single out iPad specifically; it
// isn't needed here since "not a phone" is the only distinction this makes.)
export function isMobileDevice() {
  const ua = navigator.userAgent;
  return /iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua));
}

// Every folder is copied into the app's own storage (OPFS) and read from
// there — the same on every device. A folder is picked with
// <input webkitdirectory>, which hands over a one-time flat file list with
// relative paths that buildTreeFromFileList turns into a tree.

// ponytail: no live filesystem connection here — a picked folder is a
// one-time snapshot, so changes made to the original files afterwards aren't
// seen until they're added again.
function permissiveHandle(name, extra = {}) {
  // __legacy marks a handle that carries function properties (getFile),
  // which IndexedDB can't structured-clone directly — see
  // writeLegacyFiles/buildLegacyManifest/reviveLegacyManifest below for how
  // these get persisted across reloads instead.
  return { name, __legacy: true, ...extra };
}

// What a file's bookmarks, saved page, outline state and annotated copy are
// filed under: its folder's name plus its path inside it, so two same-named
// files in different places never share them, and they survive an Update or
// a re-add of the folder. A dropped file has no folder, so it's just its name.
export function fileKeyFor(rootName, relativePath) {
  return `${rootName}:${relativePath}`;
}

export function extrasKey(handle) {
  return handle.fileKey ?? handle.name;
}

// Wraps a single dropped File (from drag-and-drop) in the same handle shape
// a copied file has, so selectFile() can treat it identically regardless of
// how it was opened.
export function wrapDroppedFile(file) {
  return permissiveHandle(file.name, { getFile: async () => file });
}

function openFileInput(configure) {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    configure(input);
    input.style.display = "none";
    input.addEventListener("change", () => {
      resolve([...input.files]);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      reject(new Error("File selection cancelled"));
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function pickFolderLegacy() {
  return openFileInput((input) => {
    input.webkitdirectory = true;
  });
}

// Plain multi-select of PDFs, for adding individual files into an already-
// connected folder (see insertFilesIntoTree below). Must be called straight
// from a click handler — the browser only allows opening a picker there.
export function pickPdfFiles() {
  return openFileInput((input) => {
    input.accept = ".pdf,application/pdf";
  });
}

export function buildTreeFromFileList(fileList, folderId = null) {
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
    // Also stashed on the handle itself (folderId alongside it) so a Recent
    // Files entry opened straight from this fresh pick can still be saved
    // and looked back up in OPFS after the app restarts.
    const relativePath = parts.slice(1).join("/");
    parent.children.push({
      name: file.name,
      kind: "file",
      relativePath,
      handle: permissiveHandle(file.name, {
        getFile: async () => file,
        file,
        folderId,
        relativePath,
        fileKey: fileKeyFor(rootName, relativePath),
      }),
    });
  }

  for (const dir of dirsByPath.values()) {
    dir.children.sort((a, b) => a.name.localeCompare(b.name));
  }
  return root;
}

// ---- Adding individual files into an already-connected folder ----
// Paths below are directory paths within the connected root, e.g. "" for the
// root itself or "Work/Q1". Names are matched case-insensitively since the
// most common backing store (a Windows/Mac disk) is.

function findDirectory(tree, path) {
  let dir = tree;
  for (const part of path ? path.split("/") : []) {
    dir = dir?.children.find((c) => c.kind === "directory" && c.name === part);
  }
  return dir ?? null;
}

// The node (file or directory) at `path`, or null — "" is the root itself.
export function findNodeAt(tree, path) {
  let node = tree;
  for (const part of path ? path.split("/") : []) {
    node = node?.kind === "directory" ? node.children.find((c) => c.name === part) : null;
  }
  return node ?? null;
}

// Returns a new tree without the node at `path` (a file or a whole folder),
// also dropping any folder left empty by it — scans only ever show folders
// that contain PDFs, so a leftover empty one would be a ghost row. The root
// itself is never removed. Only the nodes along `path` are copied.
export function removeNodeFromTree(tree, path) {
  if (!path) return tree;
  const parts = path.split("/");
  function rebuild(dir, depth) {
    const children = [];
    for (const child of dir.children) {
      if (child.name !== parts[depth]) {
        children.push(child);
      } else if (depth === parts.length - 1) {
        continue;
      } else if (child.kind === "directory") {
        const next = rebuild(child, depth + 1);
        if (next.children.length > 0) children.push(next);
      } else {
        children.push(child);
      }
    }
    return { ...dir, children };
  }
  return rebuild(tree, 0);
}

// The file nodes sitting directly inside `path` (empty if it doesn't exist).
export function filesInDirectory(tree, path) {
  return findDirectory(tree, path)?.children.filter((c) => c.kind === "file") ?? [];
}

// "a.pdf" -> "a (1).pdf" -> "a (2).pdf" ... first name not in `taken`
// (a Set of lowercase names).
export function uniqueFileName(name, taken) {
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; ; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

// Decides the final name for each picked file. `existingNames` are the files
// already in the destination; `choices[i]` is "replace" or (default) "keep"
// for the i-th file. A replace reuses the existing file's exact name; every
// other file gets a "(n)" suffix if its name is taken, including by an
// earlier file in this same batch.
export function planAddedFiles(files, existingNames, choices = {}) {
  const taken = new Map(existingNames.map((n) => [n.toLowerCase(), n]));
  return files.map((file, i) => {
    const existing = taken.get(file.name.toLowerCase());
    if (existing && choices[i] === "replace") return { file, name: existing, replaces: true };
    const name = uniqueFileName(file.name, new Set(taken.keys()));
    taken.set(name.toLowerCase(), name);
    return { file, name, replaces: false };
  });
}

// Returns a new tree with `fileNodes` placed in directory `path`, replacing
// any same-named file already there. Only the directories along `path` are
// copied; every other node is shared with the old tree.
export function insertFilesIntoTree(tree, path, fileNodes) {
  const parts = path ? path.split("/") : [];
  const incoming = new Set(fileNodes.map((f) => f.name.toLowerCase()));
  function rebuild(dir, depth) {
    if (depth === parts.length) {
      const kept = dir.children.filter((c) => !(c.kind === "file" && incoming.has(c.name.toLowerCase())));
      return { ...dir, children: [...kept, ...fileNodes].sort((a, b) => a.name.localeCompare(b.name)) };
    }
    return {
      ...dir,
      children: dir.children.map((c) =>
        c.kind === "directory" && c.name === parts[depth] ? rebuild(c, depth + 1) : c
      ),
    };
  }
  return rebuild(tree, 0);
}

// Flat, ordered list of a tree's file leaves — used to show the full file
// list up front in the add-folder progress modal, before any of them have
// actually been copied yet.
export function flattenTreeFiles(tree) {
  const out = [];
  function walk(node) {
    if (node.kind === "file") out.push({ name: node.name, relativePath: node.relativePath });
    else node.children.forEach(walk);
  }
  walk(tree);
  return out;
}

// Flat list of a tree's file leaves with their handles — for background
// work that needs to actually read each file (e.g. the resume-on-launch
// and folder-removal checks), unlike flattenTreeFiles above which is
// display-only.
export function flattenTreeFileHandles(tree) {
  const out = [];
  function walk(node) {
    if (node.kind === "file") out.push({ name: node.name, handle: node.handle });
    else node.children.forEach(walk);
  }
  walk(tree);
  return out;
}

// Same idea as flattenTreeFileHandles, but also carries each file's folder
// path within the tree (empty string for a file at the root) — global
// search uses this to disambiguate same-named files in different folders.
export function flattenTreeFileHandlesWithPath(tree) {
  const out = [];
  function walk(node, prefix) {
    if (node.kind === "file") {
      out.push({ name: node.name, path: prefix.slice(0, -1), handle: node.handle });
      return;
    }
    for (const child of node.children) walk(child, `${prefix}${node.name}/`);
  }
  for (const child of tree.children) walk(child, "");
  return out;
}

// Writes every file in a freshly-picked tree into its own OPFS
// subdirectory (folderId) — this is the actual persisted copy.
//
// onFileDone(relativePath) fires after each file finishes, so the progress
// modal can check it off live. signal lets the modal's Cancel button abort
// mid-copy — throws the same AbortError a fetch() abort would, so callers
// can tell a deliberate cancel apart from a real write failure.
export async function writeLegacyFiles(folderId, tree, { onFileDone, signal } = {}) {
  async function walk(node) {
    if (node.kind === "file") {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      await writeLegacyFile(folderId, node.relativePath, node.handle.file);
      onFileDone?.(node.relativePath);
      return;
    }
    for (const child of node.children) await walk(child);
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

// Rebuilds a single legacy file's handle from its OPFS address — used both
// by reviveLegacyManifest below and by App.jsx to bring back a Recent Files
// entry that was saved as {folderId, relativePath} instead of a live handle.
export function reviveLegacyFileHandle(folderId, name, relativePath, rootName) {
  return permissiveHandle(name, {
    getFile: () => readLegacyFile(folderId, relativePath),
    folderId,
    relativePath,
    fileKey: rootName ? fileKeyFor(rootName, relativePath) : undefined,
  });
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
        handle: reviveLegacyFileHandle(folderId, node.name, node.relativePath, manifest.name),
      };
    }
    return { name: node.name, kind: "directory", children: node.children.map(walk) };
  }
  const tree = walk(manifest);
  tree.handle = permissiveHandle(manifest.name);
  return tree;
}
