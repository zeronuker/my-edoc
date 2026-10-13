// Every connected folder keeps its file copies in the Origin Private File
// System rather than as raw blobs inside IndexedDB — same storage quota, but
// a purpose-built file store that's more efficient and more stable for large
// files.
//
// Each folder gets its own flat subdirectory named by folderId. Nested
// subfolder structure lives only in the manifest tree kept in IndexedDB (see
// fileSystem.js); each file is stored under its own random `storedAs` name
// recorded there. A name made from the path would collide for
// "Reports/Q1.pdf" and "Reports__Q1.pdf", and can't hold every character a
// real file name can (a backslash is refused), so the stored name is never
// derived from the file's name at all.

async function legacyFoldersRoot() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("legacy-folders", { create: true });
}

export async function writeLegacyFile(folderId, storedAs, file) {
  const root = await legacyFoldersRoot();
  const dir = await root.getDirectoryHandle(folderId, { create: true });
  const fileHandle = await dir.getFileHandle(storedAs, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
}

export async function readLegacyFile(folderId, storedAs) {
  const root = await legacyFoldersRoot();
  const dir = await root.getDirectoryHandle(folderId);
  const fileHandle = await dir.getFileHandle(storedAs);
  return fileHandle.getFile();
}

export async function deleteLegacyFolderFiles(folderId) {
  if (!folderId) return;
  const root = await legacyFoldersRoot();
  await root.removeEntry(folderId, { recursive: true }).catch(() => {});
}

// Removes individual files from a folder's OPFS copy (the tree's ×), by
// their stored names. A file that's already gone is skipped rather than
// failing the whole batch.
export async function deleteLegacyFiles(folderId, storedNames) {
  if (!folderId) return;
  const root = await legacyFoldersRoot();
  const dir = await root.getDirectoryHandle(folderId).catch(() => null);
  if (!dir) return;
  for (const stored of storedNames) await dir.removeEntry(stored).catch(() => {});
}

// Annotated copies (see annotations.js): one flat file per saved file, holding
// the most recently saved version — opened instead of the original. Filed by
// the file's key (folder name + path, see fileKeyFor), URL-encoded into a
// single safe name so different paths can never collide. Separate root
// directory from legacy-folders above since these aren't tied to any
// particular folder.
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
  try {
    return await (await root.getFileHandle(encodeURIComponent(key))).getFile();
  } catch {
    return null;
  }
}

export async function deleteAnnotatedCopy(key) {
  const root = await annotatedCopiesRoot();
  await root.removeEntry(encodeURIComponent(key)).catch(() => {});
}
