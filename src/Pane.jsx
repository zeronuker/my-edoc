import { IconX, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import PdfViewer from "./PdfViewer.jsx";
import EmptyState from "./EmptyState.jsx";

// Prev/next + page counter, floating over the bottom of its pane.
function PagePill({ pdfViewer, currentPage, numPages }) {
  return (
    <div className="page-pill">
      <button aria-label="Previous page" disabled={currentPage <= 1} onClick={() => pdfViewer?.previousPage()}>
        <IconChevronLeft size={16} />
      </button>
      <span className="page-pill-count">
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
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") e.target.blur();
          }}
        />
        <span className="page-pill-total">/ {numPages || "-"}</span>
      </span>
      <button
        aria-label="Next page"
        disabled={!numPages || currentPage >= numPages}
        onClick={() => pdfViewer?.nextPage()}
      >
        <IconChevronRight size={16} />
      </button>
    </div>
  );
}

// One viewer and its loading / empty states. `pane` is that viewer's usePane
// state. A PdfViewer stays mounted for the app's whole lifetime — it builds
// its own pdf.js viewer/eventBus once on mount (see PdfViewer.jsx) and swaps
// documents, so it must never be conditionally unmounted (e.g. while search
// results are showing, or while the pane is hidden) or that internal viewer is
// torn down and pdf.js breaks on the next open. Loading and empty states are
// layered on top of it instead, same trick .viewer-empty already used.
export default function Pane({
  id,
  pane,
  viewerApi,
  split,
  isActive,
  hidden,
  searchActive,
  onReady,
  onActivate,
  onClose,
  readingTheme,
  readingBrightness,
  readingContrast,
  annotationTool,
  presenting,
}) {
  const { pdf, loading, numPages, currentPage, selectedHandle, viewMode } = pane;
  return (
    <div
      className={`pane${split && isActive ? " is-active" : ""}`}
      hidden={hidden}
      onPointerDownCapture={split && !isActive ? () => onActivate(id) : undefined}
    >
      {split && (
        <div className="pane-header">
          <span className="pane-header-name">{selectedHandle?.name ?? "No file"}</span>
          <button className="pane-header-close" aria-label="Close this pane" onClick={() => onClose(id)}>
            <IconX size={14} />
          </button>
        </div>
      )}
      <PdfViewer
        viewMode={viewMode}
        onReady={onReady}
        readingTheme={readingTheme}
        readingBrightness={readingBrightness}
        readingContrast={readingContrast}
        annotationTool={isActive ? annotationTool : null}
        presenting={presenting}
      />
      {loading ? (
        <div className="viewer-empty">
          <span className="viewer-loading">
            <span className="spinner" />
            Loading {selectedHandle?.name}…
          </span>
        </div>
      ) : !pdf && !searchActive ? (
        <div className="viewer-empty">
          <EmptyState compact={split} />
        </div>
      ) : null}
      {pdf && !loading && (
        <PagePill pdfViewer={viewerApi?.pdfViewer} currentPage={currentPage} numPages={numPages} />
      )}
    </div>
  );
}
