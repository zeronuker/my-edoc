import PageCanvas from "./PageCanvas.jsx";

export default function Viewer({ pdf, viewMode, scale, currentPage }) {
  if (!pdf) return <div className="viewer-empty">Select a PDF to view</div>;

  const numPages = pdf.numPages;

  if (viewMode === "continuous") {
    const pages = Array.from({ length: numPages }, (_, i) => i + 1);
    return (
      <div className="viewer viewer-continuous">
        {pages.map((p) => (
          <PageCanvas key={p} pdf={pdf} pageNumber={p} scale={scale} />
        ))}
      </div>
    );
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
