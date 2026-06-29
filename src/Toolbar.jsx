import SearchBar from "./SearchBar.jsx";

export default function Toolbar({ viewMode, setViewMode, scale, currentPage, numPages, pdfViewer, eventBus }) {
  return (
    <div className="toolbar">
      <select value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
        <option value="single">Single page</option>
        <option value="continuous">Continuous</option>
        <option value="two-up">Two-page</option>
      </select>

      {viewMode !== "continuous" && (
        <span className="page-nav">
          <button
            aria-label="Previous page"
            disabled={currentPage <= 1}
            onClick={() => pdfViewer?.previousPage()}
          >
            ‹
          </button>
          <input
            type="number"
            min={1}
            max={numPages}
            value={currentPage}
            aria-label="Current page"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (pdfViewer && n >= 1 && n <= numPages) pdfViewer.currentPageNumber = n;
            }}
          />
          <span>/ {numPages || "-"}</span>
          <button
            aria-label="Next page"
            disabled={!numPages || currentPage >= numPages}
            onClick={() => pdfViewer?.nextPage()}
          >
            ›
          </button>
        </span>
      )}

      <span className="zoom">
        <button aria-label="Zoom out" onClick={() => pdfViewer?.decreaseScale()}>-</button>
        <span>{Math.round(scale * 100)}%</span>
        <button aria-label="Zoom in" onClick={() => pdfViewer?.increaseScale()}>+</button>
        <button onClick={() => pdfViewer && (pdfViewer.currentScaleValue = "page-width")}>Fit width</button>
        <button onClick={() => pdfViewer && (pdfViewer.currentScaleValue = "page-fit")}>Fit page</button>
      </span>

      <SearchBar eventBus={eventBus} />
    </div>
  );
}
