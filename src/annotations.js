import { writeAnnotatedCopy, readAnnotatedCopy } from "./opfs.js";

// The app copy of this file's saved annotations, if one exists — callers
// load this instead of the file itself so accumulated edits carry across
// sessions. Keyed by filename, same one-blob-per-key convention as
// bookmarks/filePositions/recentFiles.
export async function loadAnnotatedCopy(fileName) {
  return readAnnotatedCopy(fileName);
}

// Bakes the document's current annotation edits into real PDF bytes
// (pdf.js's own saveDocument) and keeps them as the file's app copy. The
// file itself is never modified.
export async function saveAnnotations(fileHandle, pdfDocument) {
  const bytes = await pdfDocument.saveDocument();
  await writeAnnotatedCopy(fileHandle.name, bytes);
}
