// Legacy (Safari/iOS, no live folder handle) folders keep their file
// copies in the Origin Private File System rather than as raw blobs
// inside IndexedDB — same storage quota, but a purpose-built file store
// that's more efficient and more stable for large files.
//
// Each connected folder gets its own flat subdirectory named by folderId;
// nested subfolder structure is preserved only in the manifest tree kept
// in IndexedDB (see fileSystem.js), with each leaf's original relative
// path escaped into a single flat filename here, so no nested-directory
// bookkeeping is needed on the OPFS side.

async function legacyFoldersRoot() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("legacy-folders", { create: true });
}

function escapeName(relativePath) {
  return relativePath.replaceAll("/", "__");
}

export async function writeLegacyFile(folderId, relativePath, file) {
  const root = await legacyFoldersRoot();
  const dir = await root.getDirectoryHandle(folderId, { create: true });
  const fileHandle = await dir.getFileHandle(escapeName(relativePath), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
}

export async function readLegacyFile(folderId, relativePath) {
  const root = await legacyFoldersRoot();
  const dir = await root.getDirectoryHandle(folderId);
  const fileHandle = await dir.getFileHandle(escapeName(relativePath));
  return fileHandle.getFile();
}

export async function deleteLegacyFolderFiles(folderId) {
  if (!folderId) return;
  const root = await legacyFoldersRoot();
  await root.removeEntry(folderId, { recursive: true }).catch(() => {});
}

// Removes individual files from a folder's OPFS copy (the tree's ×). A file
// that's already gone is skipped rather than failing the whole batch, so the
// caller can always go on to drop them from the manifest.
export async function deleteLegacyFiles(folderId, relativePaths) {
  if (!folderId) return;
  const root = await legacyFoldersRoot();
  const dir = await root.getDirectoryHandle(folderId).catch(() => null);
  if (!dir) return;
  for (const path of relativePaths) await dir.removeEntry(escapeName(path)).catch(() => {});
}

// Annotated copies (see annotations.js): one flat file per saved file, holding
// the most recently saved version — opened instead of the original. Filed by
// the file's key (folder name + path, see fileKeyFor), URL-encoded into a
// single safe name so different paths can never collide. Copies saved before
// that were filed under the bare file name; reading and deleting also look
// there. Separate root directory from legacy-folders above since these
// aren't tied to any particular folder.
async function annotatedCopiesRoot() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("annotated-copies", { create: true });
}

// Keys of every file that has one.
export async function listAnnotatedCopyNames() {
  const root = await annotatedCopiesRoot();
  const keys = [];
  for await (const [stored] of root.entries()) {
    try {
      keys.push(decodeURIComponent(stored));
    } catch {
      keys.push(stored);
    }
  }
  return keys;
}

export async function writeAnnotatedCopy(key, bytes) {
  const root = await annotatedCopiesRoot();
  const fileHandle = await root.getFileHandle(encodeURIComponent(key), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

// Returns the saved copy, or null if this file has never had one.
export async function readAnnotatedCopy(key) {
  const root = await annotatedCopiesRoot();
  for (const stored of [encodeURIComponent(key), escapeName(key)]) {
    try {
      return await (await root.getFileHandle(stored)).getFile();
    } catch {
      // not under this name; try the next
    }
  }
  return null;
}

export async function deleteAnnotatedCopy(key) {
  const root = await annotatedCopiesRoot();
  await root.removeEntry(encodeURIComponent(key)).catch(() => {});
  await root.removeEntry(escapeName(key)).catch(() => {});
}
