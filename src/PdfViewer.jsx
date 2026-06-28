import { useEffect, useRef } from "react";
import {
  EventBus,
  PDFLinkService,
  PDFFindController,
  PDFViewer,
  ScrollMode,
  SpreadMode,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";

export const SCROLL_MODE_BY_VIEW = {
  single: ScrollMode.PAGE,
  continuous: ScrollMode.VERTICAL,
  "two-up": ScrollMode.PAGE,
};
export const SPREAD_MODE_BY_VIEW = {
  single: SpreadMode.NONE,
  continuous: SpreadMode.NONE,
  "two-up": SpreadMode.ODD,
};

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;

// Touch gestures: tap zones (single/two-up) to flip a page, horizontal
// swipe (two-up only) to flip a spread, pinch (all modes) to zoom.
// Continuous mode gets none of this — native scroll already does the
// "swipe to move through the document" job.
function attachTouchGestures(el, pdfViewer, viewMode) {
  const pointers = new Map();
  let pinchStartDist = null;
  let pinchStartScale = null;
  let isPinching = false;
  let singleStart = null;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function onPointerDown(e) {
    if (e.pointerType !== "touch") return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      singleStart = { x: e.clientX, y: e.clientY, time: Date.now() };
    } else if (pointers.size === 2) {
      isPinching = true;
      singleStart = null;
      const [a, b] = [...pointers.values()];
      pinchStartDist = dist(a, b);
      pinchStartScale = pdfViewer.currentScale;
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinchStartDist) {
      const [a, b] = [...pointers.values()];
      const ratio = dist(a, b) / pinchStartDist;
      pdfViewer.currentScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStartScale * ratio));
    }
  }

  function onPointerEnd(e) {
    const wasSingle = pointers.size === 1 && !isPinching;
    const start = singleStart;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      isPinching = false;
      pinchStartDist = null;
    }
    singleStart = null;
    if (e.pointerType !== "touch" || !wasSingle || !start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dt = Date.now() - start.time;
    const enableSwipe = viewMode === "two-up";
    const enableTap = viewMode !== "continuous";

    if (enableSwipe && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      dx < 0 ? pdfViewer.nextPage() : pdfViewer.previousPage();
    } else if (enableTap && Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300) {
      const tapX = e.clientX - el.getBoundingClientRect().left;
      tapX > el.clientWidth / 2 ? pdfViewer.nextPage() : pdfViewer.previousPage();
    }
  }

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerEnd);
  el.addEventListener("pointercancel", onPointerEnd);
  return () => {
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerEnd);
    el.removeEventListener("pointercancel", onPointerEnd);
  };
}

// Thin React wrapper around pdf.js's own viewer widget (PDFViewer +
// PDFFindController), instead of a hand-rolled canvas renderer — gets
// text selection, find-and-highlight, and zoom presets for free, the
// same engine Firefox's built-in PDF viewer uses.
export default function PdfViewer({ pdf, viewMode, onReady }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const pdfViewerRef = useRef(null);

  useEffect(() => {
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const findController = new PDFFindController({ eventBus, linkService });
    const pdfViewer = new PDFViewer({
      container: containerRef.current,
      viewer: viewerRef.current,
      eventBus,
      linkService,
      findController,
    });
    linkService.setViewer(pdfViewer);
    pdfViewerRef.current = pdfViewer;
    onReady?.({ pdfViewer, eventBus, findController });
    // ponytail: construct exactly once per mount; onReady is only ever
    // called right here, so it deliberately isn't in the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pdfViewerRef.current) return;
    return attachTouchGestures(containerRef.current, pdfViewerRef.current, viewMode);
  }, [viewMode]);

  return (
    <div className="viewer-area">
      <div className="pdf-viewer-container" ref={containerRef}>
        <div className="pdfViewer" ref={viewerRef} />
      </div>
    </div>
  );
}
