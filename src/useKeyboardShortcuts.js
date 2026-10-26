import { useEffect } from "react";

// Arrows/PageUp/PageDown for paging, +/- for zoom, Ctrl/Cmd+F to focus
// search. Skipped while typing in a field (except Ctrl/Cmd+F, which has no
// risk of colliding with normal typing). In presentation mode Space also
// pages (Shift+Space back) and Escape ends it.
export function useKeyboardShortcuts(viewerApi, { presenting, onExitPresentation }) {
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        document.getElementById("doc-search-input")?.focus();
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
