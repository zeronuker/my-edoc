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
// File bytes (not just a reference) get persisted to IndexedDB, so this
// is actually fine across reloads; the real limitation is no detection
// of files added/removed on disk after picking, since it's a one-time
// snapshot rather than a live handle.
function permissiveHandle(name, extra = {}) {
  // __legacy marks this for App.jsx: it has function properties
  // (getFile/queryPermission), which IndexedDB can't structured-clone,
  // so these never get persisted across reloads — only real
  // FileSystemHandle objects from the Chromium path do.
  return { name, __legacy: true, queryPermission: async () => "granted", ...extra };
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
    parent.children.push({
      name: file.name,
      kind: "file",
      handle: permissiveHandle(file.name, { getFile: async () => file }),
    });
  }

  for (const dir of dirsByPath.values()) {
    dir.children.sort((a, b) => a.name.localeCompare(b.name));
  }
  return root;
}
