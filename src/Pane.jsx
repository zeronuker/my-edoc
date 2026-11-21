import { useRef, useState } from "react";
import { usePresence } from "./usePresence.js";
import { IconX, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import PdfViewer from "./PdfViewer.jsx";
import EmptyState from "./EmptyState.jsx";
import { NO_AUTO } from "./appHelpers.js";

// Prev/next + page counter, floating over the bottom of its pane.
function PagePill({ pdfViewer, currentPage, numPages }) {
  // What is typed in the box until Enter or leaving it: going to the page on
  // every digit ("125" visiting 1, 12, 125) also stopped the box being emptied.
  const [draft, setDraft] = useState(null);
  const cancelled = useRef(false); // Escape: leave without going to the typed page
  function commit() {
    const n = Number(draft);
    if (pdfViewer && n >= 1 && n <= numPages) pdfViewer.currentPageNumber = n;
    setDraft(null);
  }
  return (
    <div className="page-pill">
      <button aria-label="Previous page" disabled={currentPage <= 1} onClick={() => pdfViewer?.previousPage()}>
        <IconChevronLeft size={16} />
      </button>
      <span className="page-pill-count">
        <input
          type="text"
          inputMode="numeric"
          {...NO_AUTO}
          value={draft ?? currentPage}
          aria-label="Current page"
          onFocus={(e) => {
            cancelled.current = false;
            e.target.select();
          }}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
          onBlur={() => {
            if (!cancelled.current && draft !== null) commit();
            cancelled.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              cancelled.current = true;
              setDraft(null);
            }
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
  // Set by the touch that activates this pane, so PdfViewer's tap-to-turn-page
  // skips that same touch.
  const tapGuardRef = useRef(false);
  // The loading cover stays mounted for a short fade, so the new document
  // eases in rather than popping in over it.
  const cover = usePresence(loading);
  return (
    <div
      className={`pane${split && isActive ? " is-active" : ""}`}
      data-pane={id}
      hidden={hidden}
      onPointerDownCapture={
        split && !isActive
          ? (e) => {
              if (e.pointerType === "touch") tapGuardRef.current = true;
              onActivate(id);
            }
          : undefined
      }
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
        tapGuardRef={tapGuardRef}
      />
      {cover.present ? (
        <div className={`viewer-empty${cover.closing ? " is-closing" : ""}`}>
          <span className="viewer-loading">
            <span className="spinner" />
            Loading {selectedHandle?.name}…
          </span>
          <div className="viewer-skeleton" aria-hidden="true">
            {[0, 1].map((i) => (
              <div key={i} className="viewer-skeleton-page">
                {[0, 1, 2, 3, 4].map((j) => (
                  <i key={j} />
                ))}
              </div>
            ))}
          </div>
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
