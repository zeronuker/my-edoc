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

// Annotated copies (see annotations.js): one flat file per original
// filename, holding the most recently saved "sidecar" version — used
// instead of the original when a file's annotation mode is "sidecar" (the
// original is never touched in that mode). Separate root directory from
// legacy-folders above since these aren't tied to any particular folder.
async function annotatedCopiesRoot() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("annotated-copies", { create: true });
}

export async function writeAnnotatedCopy(name, bytes) {
  const root = await annotatedCopiesRoot();
  const fileHandle = await root.getFileHandle(escapeName(name), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

// Returns the sidecar File, or null if this file has never been saved in
// sidecar mode.
export async function readAnnotatedCopy(name) {
  const root = await annotatedCopiesRoot();
  try {
    const fileHandle = await root.getFileHandle(escapeName(name));
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

export async function deleteAnnotatedCopy(name) {
  const root = await annotatedCopiesRoot();
  await root.removeEntry(escapeName(name)).catch(() => {});
}
