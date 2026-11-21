import { useEffect } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Tab wraps around inside `dialog` instead of walking out into the page behind.
function keepFocusIn(dialog, e) {
  const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const at = document.activeElement;
  if (!dialog.contains(at)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && at === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && at === last) {
    e.preventDefault();
    first.focus();
  }
}

// Arrows/PageUp/PageDown for paging, +/- for zoom, Ctrl/Cmd+F to focus
// search. Skipped while typing in a field (except Ctrl/Cmd+F, which has no
// risk of colliding with normal typing). In presentation mode Space also
// pages (Shift+Space back) and Escape ends it.
export function useKeyboardShortcuts(viewerApi, { presenting, onExitPresentation }) {
  useEffect(() => {
    function onKeyDown(e) {
      // Some browsers send key events with no key (autofill).
      if (!e.key) return;
      // While a dialog is open the keys belong to it: Escape closes it the way
      // its backdrop does (a dialog that must be answered has no backdrop
      // click, so it stays), Tab stays inside it, and nothing pages the
      // document behind it.
      const dialogs = document.querySelectorAll(".modal-dialog:not(.is-closing)");
      if (dialogs.length > 0) {
        const top = dialogs[dialogs.length - 1];
        if (e.key === "Escape") {
          [...document.querySelectorAll(".modal-backdrop:not(.is-closing)")].pop()?.click();
        } else if (e.key === "Tab") keepFocusIn(top, e);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        // With no search box on screen (no document open) the browser's own
        // find is left alone.
        const box = document.getElementById("doc-search-input");
        if (box) {
          e.preventDefault();
          box.focus();
        }
        return;
      }
      if (presenting && e.key === "Escape") {
        onExitPresentation();
        return;
      }
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!viewerApi) return;
      const { pdfViewer } = viewerApi;
      if (e.key === "ArrowLeft" || e.key === "PageUp") pdfViewer.previousPage();
      else if (e.key === "ArrowRight" || e.key === "PageDown") pdfViewer.nextPage();
      else if (e.key === "+" || e.key === "=") pdfViewer.increaseScale();
      else if (e.key === "-" || e.key === "_") pdfViewer.decreaseScale();
      else if (presenting && e.key === " ") {
        e.preventDefault();
        if (e.shiftKey) pdfViewer.previousPage();
        else pdfViewer.nextPage();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerApi, presenting, onExitPresentation]);
}
