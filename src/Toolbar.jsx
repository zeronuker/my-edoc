import SearchBar from "./SearchBar.jsx";

export default function Toolbar({
  viewMode,
  setViewMode,
  scale,
  currentPage,
  numPages,
  pdfViewer,
  eventBus,
  sidebarOpen,
  onToggleSidebar,
  nightReading,
  onToggleNightReading,
  isBookmarked,
  onToggleBookmark,
  annotationTool,
  onSetAnnotationTool,
  hasUnsavedAnnotations,
  onSaveAnnotations,
  onChangeAnnotationMode,
}) {
  return (
    <div className="toolbar">
      <button
        className="icon-btn sidebar-toggle"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        aria-pressed={sidebarOpen}
      >
        ☰
      </button>

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

      <button
        className={`bookmark-toggle${isBookmarked ? " active" : ""}`}
        aria-label={isBookmarked ? "Remove bookmark for this page" : "Bookmark this page"}
        aria-pressed={isBookmarked}
        title="Bookmark this page"
        disabled={!numPages}
        onClick={onToggleBookmark}
      >
        {isBookmarked ? "★" : "☆"}
      </button>

      <span className="zoom">
        <button aria-label="Zoom out" onClick={() => pdfViewer?.decreaseScale()}>-</button>
        <span>{Math.round(scale * 100)}%</span>
        <button aria-label="Zoom in" onClick={() => pdfViewer?.increaseScale()}>+</button>
        <button onClick={() => pdfViewer && (pdfViewer.currentScaleValue = "page-width")}>Fit width</button>
        <button onClick={() => pdfViewer && (pdfViewer.currentScaleValue = "page-fit")}>Fit page</button>
      </span>

      <span className="rotate">
        <button
          aria-label="Rotate left"
          onClick={() => pdfViewer && (pdfViewer.pagesRotation = (pdfViewer.pagesRotation + 270) % 360)}
        >
          ⟲
        </button>
        <button
          aria-label="Rotate right"
          onClick={() => pdfViewer && (pdfViewer.pagesRotation = (pdfViewer.pagesRotation + 90) % 360)}
        >
          ⟳
        </button>
      </span>

      <span className="annotate">
        {[
          { tool: "highlight", label: "Highlight" },
          { tool: "ink", label: "Draw" },
          { tool: "freetext", label: "Note" },
        ].map(({ tool, label }) => (
          <button
            key={tool}
            className={`annotate-tool${annotationTool === tool ? " active" : ""}`}
            aria-pressed={annotationTool === tool}
            disabled={!numPages}
            onClick={() => onSetAnnotationTool(annotationTool === tool ? null : tool)}
          >
            {label}
          </button>
        ))}
        <button disabled={!hasUnsavedAnnotations} onClick={onSaveAnnotations}>
          Save
        </button>
        <button
          aria-label="Change where annotations are saved"
          title="Change where annotations are saved"
          disabled={!numPages}
          onClick={onChangeAnnotationMode}
        >
          ▾
        </button>
      </span>

      <button
        className={`night-reading-toggle${nightReading ? " active" : ""}`}
        aria-label={nightReading ? "Turn off night reading" : "Turn on night reading"}
        aria-pressed={nightReading}
        title="Night reading (invert page colors)"
        onClick={onToggleNightReading}
      >
        ◐
      </button>

      <SearchBar eventBus={eventBus} />
    </div>
  );
}
