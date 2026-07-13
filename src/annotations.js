import { writeAnnotatedCopy, readAnnotatedCopy, deleteAnnotatedCopy } from "./opfs.js";
import { dbGet, dbSet } from "./db.js";

// Per-file choice of where saved annotations live — "writeback" (the
// original file itself) or "sidecar" (an app-managed OPFS copy, original
// left untouched). Keyed by filename, same one-blob-per-key convention as
// bookmarks/filePositions/recentFiles.
export async function getAnnotationMode(fileName) {
  const modes = (await dbGet("annotationModes")) || {};
  return modes[fileName] || null;
}

export async function setAnnotationMode(fileName, mode) {
  const modes = (await dbGet("annotationModes")) || {};
  modes[fileName] = mode;
  await dbSet("annotationModes", modes);
}

// The sidecar copy for this file, if one exists — callers load this instead
// of the original so accumulated edits carry across sessions in sidecar mode.
export async function loadAnnotatedCopy(fileName) {
  return readAnnotatedCopy(fileName);
}

// Bakes the document's current annotation edits into real PDF bytes
// (pdf.js's own saveDocument, same mechanism regardless of destination) and
// writes them to `mode`'s destination. Switching mode away from sidecar
// deletes the stale sidecar copy, so at most one destination is ever active
// per file — otherwise a leftover sidecar could keep getting loaded even
// after the user picked write-back.
export async function saveAnnotations(fileHandle, pdfDocument, mode) {
  const bytes = await pdfDocument.saveDocument();
  if (mode === "writeback") {
    const writable = await fileHandle.createWritable();
    await writable.write(bytes);
    await writable.close();
    await deleteAnnotatedCopy(fileHandle.name);
  } else {
    await writeAnnotatedCopy(fileHandle.name, bytes);
  }
  await setAnnotationMode(fileHandle.name, mode);
}
