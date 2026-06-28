import { useEffect, useRef, useState } from "react";
import PageCanvas from "./PageCanvas.jsx";
import { getPageSize } from "./edoc.js";

// Only mounts PageCanvas for pages near the visible scroll area; everything
// else is a correctly-sized placeholder div, so scroll height stays right
// without paying to render (and hold in memory) every page up front.
function ContinuousViewer({ pdf, scale }) {
  const [pageSize, setPageSize] = useState(null);
  const [visible, setVisible] = useState(() => new Set());
  const containerRef = useRef(null);
  const slotRefs = useRef(new Map());

  useEffect(() => {
    let active = true;
    getPageSize(pdf, scale).then((size) => {
      if (active) setPageSize(size);
    });
    return () => {
      active = false;
    };
  }, [pdf, scale]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const p = Number(entry.target.dataset.page);
            if (entry.isIntersecting) next.add(p);
            else next.delete(p);
          }
          return next;
        });
      },
      { root: containerRef.current, rootMargin: "800px 0px" }
    );
    for (const el of slotRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [pdf, pageSize]);

  if (!pageSize) return <div className="viewer viewer-continuous" ref={containerRef} />;

  const pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  const slotStyle = { width: pageSize.width, height: pageSize.height };

  return (
    <div className="viewer viewer-continuous" ref={containerRef}>
      {pages.map((p) => (
        <div
          key={p}
          className="page-slot"
          data-page={p}
          style={slotStyle}
          ref={(el) => {
            if (el) slotRefs.current.set(p, el);
            else slotRefs.current.delete(p);
          }}
        >
          {visible.has(p) && <PageCanvas pdf={pdf} pageNumber={p} scale={scale} />}
        </div>
      ))}
    </div>
  );
}

export default function Viewer({ pdf, viewMode, scale, currentPage }) {
  if (!pdf) return <div className="viewer-empty">Select a PDF to view</div>;

  const numPages = pdf.numPages;

  if (viewMode === "continuous") {
    return <ContinuousViewer pdf={pdf} scale={scale} />;
  }

  if (viewMode === "two-up") {
    const left = currentPage;
    const right = currentPage + 1 <= numPages ? currentPage + 1 : null;
    return (
      <div className="viewer viewer-two-up">
        <PageCanvas pdf={pdf} pageNumber={left} scale={scale} />
        {right && <PageCanvas pdf={pdf} pageNumber={right} scale={scale} />}
      </div>
    );
  }

  // single page
  return (
    <div className="viewer viewer-single">
      <PageCanvas pdf={pdf} pageNumber={currentPage} scale={scale} />
    </div>
  );
}
