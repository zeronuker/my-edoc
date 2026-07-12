import { loadDocument } from "./edoc.js";

// Concatenates every page's text into one lowercased blob for substring
// search — no per-page/word structure kept, this only needs to answer
// "does this document contain X" for the tree search box.
export async function extractText(file) {
  const doc = await loadDocument(file, { skipPassword: true });
  try {
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(" ") + " ";
    }
    return text.toLowerCase();
  } finally {
    doc.destroy();
  }
}
