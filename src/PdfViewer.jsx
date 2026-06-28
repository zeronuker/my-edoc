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

// Thin React wrapper around pdf.js's own viewer widget (PDFViewer +
// PDFFindController), instead of a hand-rolled canvas renderer — gets
// text selection, find-and-highlight, and zoom presets for free, the
// same engine Firefox's built-in PDF viewer uses.
export default function PdfViewer({ pdf, viewMode, onReady }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

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
    onReady?.({ pdfViewer, eventBus, findController });
    // ponytail: construct exactly once per mount; onReady is only ever
    // called right here, so it deliberately isn't in the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="viewer-area">
      <div className="pdf-viewer-container" ref={containerRef}>
        <div className="pdfViewer" ref={viewerRef} />
      </div>
    </div>
  );
}
