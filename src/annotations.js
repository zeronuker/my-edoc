import { writeAnnotatedCopy, readAnnotatedCopy } from "./opfs.js";
import { extrasKey } from "./fileSystem.js";

// The app copy of this file's saved annotations, if one exists — callers
// load this instead of the file itself so accumulated edits carry across
// sessions. `key` is the file's extrasKey (folder + path), not its name.
export async function loadAnnotatedCopy(key) {
  return readAnnotatedCopy(key);
}

// Bakes the document's current annotation edits into real PDF bytes
// (pdf.js's own saveDocument) and keeps them as the file's app copy. The
// file itself is never modified.
export async function saveAnnotations(fileHandle, pdfDocument) {
  const bytes = await pdfDocument.saveDocument();
  await writeAnnotatedCopy(extrasKey(fileHandle), bytes);
}
