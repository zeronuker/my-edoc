import { useEffect, useRef, useState } from "react";

const THUMB_WIDTH = 100;

// pdf.js's own PDFThumbnailViewer widget lives only in the full viewer app,
// not in the embeddable pdf_viewer.mjs bundle this project uses — so this
// renders thumbnails itself, straight off the already-loaded PDFDocumentProxy.
// Each thumbnail renders once it scrolls near the viewport (IntersectionObserver)
// rather than all at once, so a large document doesn't render hundreds of
// canvases up front.
function Thumbnail({ pdf, pageNumber, isActive, onSelect }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (rendered) return;
    const el = wrapRef.current;
    if (!el) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        renderThumb();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);

    async function renderThumb() {
      const page = await pdf.getPage(pageNumber);
      const scale = THUMB_WIDTH / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      if (!cancelled) setRendered(true);
    }

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pdf, pageNumber, rendered]);

  useEffect(() => {
    if (isActive) wrapRef.current?.scrollIntoView({ block: "nearest" });
  }, [isActive]);

  return (
    <div
      ref={wrapRef}
      className={`thumb${isActive ? " active" : ""}`}
      onClick={() => onSelect(pageNumber)}
    >
      <canvas ref={canvasRef} />
      <span className="thumb-page-num">{pageNumber}</span>
    </div>
  );
}

export default function ThumbnailView({ pdf, numPages, currentPage, onSelect }) {
  if (!pdf || !numPages) return null;
  return (
    <div className="thumbnail-view">
      {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
        <Thumbnail key={n} pdf={pdf} pageNumber={n} isActive={n === currentPage} onSelect={onSelect} />
      ))}
    </div>
  );
}
