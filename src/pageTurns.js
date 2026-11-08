// Per-page view rotation for the toolbar Rotate buttons: it turns the page (or both
// pages of a spread) on screen and never touches the file. The turns are kept in
// memory per open tab, so switching tabs keeps them; closing the tab, closing the
// app or reloading drops them. (Turning pages for good is the Rotate window.)

const SPREAD_NONE = 0; // pdf.js SpreadMode.NONE (not imported: the viewer module needs a browser)

const turnsByTab = new Map(); // tab key -> Map(page number -> degrees)

export const getTurns = (key) => turnsByTab.get(key) ?? new Map();

export function setTurn(key, page, degrees) {
  const turns = turnsByTab.get(key) ?? new Map();
  if (degrees) turns.set(page, degrees);
  else turns.delete(page);
  if (turns.size) turnsByTab.set(key, turns);
  else turnsByTab.delete(key);
}

export const clearTurns = (key) => turnsByTab.delete(key);

// The page pdf.js reports as current is the one most on screen; in a two-page view
// its spread partner turns with it (found in pdf.js's own spread container).
export function pagesToTurn(pdfViewer) {
  const current = pdfViewer.currentPageNumber;
  if (pdfViewer.spreadMode === SPREAD_NONE) return [current];
  const spread = pdfViewer.getPageView(current - 1)?.div.parentElement;
  const pages = [...(spread?.querySelectorAll(".page") ?? [])].map((p) => Number(p.dataset.pageNumber));
  return pages.length ? pages : [current];
}

// Turns the page(s) in view by `delta` degrees (90 or 270) and remembers it for `key`.
export function turnPages(pdfViewer, key, delta) {
  if (!pdfViewer?.pdfDocument || !key) return;
  for (const page of pagesToTurn(pdfViewer)) {
    const view = pdfViewer.getPageView(page - 1);
    if (!view) continue;
    const next = (((view.rotation + delta) % 360) + 360) % 360;
    view.update({ rotation: next });
    setTurn(key, page, next);
  }
  // Re-fit like pdf.js does after its own rotate: a named scale (fit page / width) follows the new shape.
  const scale = pdfViewer.currentScaleValue;
  if (scale && Number.isNaN(Number(scale))) pdfViewer.currentScaleValue = scale;
  else pdfViewer.update();
}

// Puts a tab's remembered turns back on a freshly loaded document.
export function applyTurns(pdfViewer, key) {
  for (const [page, degrees] of getTurns(key)) pdfViewer.getPageView(page - 1)?.update({ rotation: degrees });
}
