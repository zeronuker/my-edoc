import { loadDocument } from "./edoc.js";

// Concatenates every page's text into one blob for substring search — no
// per-page/word structure kept. Original case is preserved (matching is
// done case-insensitively by callers) so search results can show readable
// snippets instead of all-lowercase text.
export async function extractText(file) {
  const doc = await loadDocument(file, { skipPassword: true });
  try {
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(" ") + " ";
    }
    return text;
  } finally {
    doc.destroy();
  }
}
