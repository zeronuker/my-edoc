import { useEffect, useRef, useState } from "react";
import {
  IconLayoutSidebar,
  IconChevronDown,
  IconZoomIn,
  IconZoomOut,
  IconBookmark,
  IconBookmarkFilled,
  IconRotate,
  IconRotateClockwise,
  IconMoon,
  IconSettings,
  IconFileText,
  IconSearch,
  IconX,
  IconEdit,
} from "@tabler/icons-react";
import SearchBar from "./SearchBar.jsx";

const ANNOTATE_TOOLS = [
  { tool: "highlight", label: "Highlight" },
  { tool: "ink", label: "Draw" },
  { tool: "freetext", label: "Note" },
];

const VIEW_MODES = [
  { value: "single", label: "Single page" },
  { value: "continuous", label: "Continuous" },
  { value: "two-up", label: "Two-page" },
];

// Closes whichever dropdown is open on an outside click or Escape — same
// pattern as TreeView's FolderActions menu.
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, ref };
}

export default function Toolbar({
  viewMode,
  setViewMode,
  scale,
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
  onOpenSettings,
  settingsUpdateAvailable,
}) {
  const viewMenu = useDropdown();
  const annotateMenu = useDropdown();
  const viewModeMenu = useDropdown();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const activeToolLabel = ANNOTATE_TOOLS.find((t) => t.tool === annotationTool)?.label ?? "Annotate";

  return (
    <div className="toolbar">
      <button
        className="icon-btn sidebar-toggle"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        aria-pressed={sidebarOpen}
      >
        <IconLayoutSidebar size={16} />
      </button>
      <span className="toolbar-divider" aria-hidden="true" />

      <div className="toolbar-group toolbar-group-nav">
        <span className="view-mode-select">
          <select
            className="view-mode-native"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
            aria-label="Page view mode"
          >
            <option value="single">Single page</option>
            <option value="continuous">Continuous</option>
            <option value="two-up">Two-page</option>
          </select>

          <span className="view-mode-dropdown dropdown" ref={viewModeMenu.ref}>
            <button
              className="view-mode-trigger"
              aria-expanded={viewModeMenu.open}
              aria-label="Page view mode"
              onClick={() => viewModeMenu.setOpen((v) => !v)}
            >
              <IconFileText size={14} />
              <IconChevronDown size={10} />
            </button>
            {viewModeMenu.open && (
              <div className="dropdown-menu">
                {VIEW_MODES.map(({ value, label }) => (
                  <button
                    key={value}
                    className={viewMode === value ? "active" : ""}
                    onClick={() => {
                      setViewMode(value);
                      viewModeMenu.setOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </span>
        </span>

        <span className="toolbar-divider" aria-hidden="true" />

        <span className="zoom dropdown" ref={viewMenu.ref}>
          <button aria-label="Zoom out" onClick={() => pdfViewer?.decreaseScale()}>
            <IconZoomOut size={16} />
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => pdfViewer?.increaseScale()}>
            <IconZoomIn size={16} />
          </button>
          <button
            aria-label="More view options"
            aria-expanded={viewMenu.open}
            onClick={() => viewMenu.setOpen((v) => !v)}
          >
            <IconChevronDown size={16} />
          </button>
          {viewMenu.open && (
            <div className="dropdown-menu">
              <button
                onClick={() => {
                  if (pdfViewer) pdfViewer.currentScaleValue = "page-width";
                  viewMenu.setOpen(false);
                }}
              >
                Fit width
              </button>
              <button
                onClick={() => {
                  if (pdfViewer) pdfViewer.currentScaleValue = "page-fit";
                  viewMenu.setOpen(false);
                }}
              >
                Fit page
              </button>
              <span className="dropdown-sep" />
              <button
                aria-label="Rotate left"
                onClick={() => {
                  if (pdfViewer) pdfViewer.pagesRotation = (pdfViewer.pagesRotation + 270) % 360;
                  viewMenu.setOpen(false);
                }}
              >
                <IconRotate size={16} /> Rotate left
              </button>
              <button
                aria-label="Rotate right"
                onClick={() => {
                  if (pdfViewer) pdfViewer.pagesRotation = (pdfViewer.pagesRotation + 90) % 360;
                  viewMenu.setOpen(false);
                }}
              >
                <IconRotateClockwise size={16} /> Rotate right
              </button>
            </div>
          )}
        </span>
      </div>

      <span className="toolbar-divider" aria-hidden="true" />

      <div className="toolbar-group toolbar-group-tools">
        <button
          className={`bookmark-toggle${isBookmarked ? " active" : ""}`}
          aria-label={isBookmarked ? "Remove bookmark for this page" : "Bookmark this page"}
          aria-pressed={isBookmarked}
          title="Bookmark this page"
          disabled={!numPages}
          onClick={onToggleBookmark}
        >
          {isBookmarked ? <IconBookmarkFilled size={16} /> : <IconBookmark size={16} />}
        </button>

        <span className="annotate dropdown" ref={annotateMenu.ref}>
          <button
            className={`annotate-tool${annotationTool ? " active" : ""}`}
            aria-expanded={annotateMenu.open}
            aria-label={activeToolLabel}
            onClick={() => annotateMenu.setOpen((v) => !v)}
          >
            <IconEdit size={14} className="annotate-icon" aria-hidden="true" />
            <span className="annotate-label">{activeToolLabel}</span> <IconChevronDown size={16} />
          </button>
          {annotateMenu.open && (
            <div className="dropdown-menu">
              {ANNOTATE_TOOLS.map(({ tool, label }) => (
                <button
                  key={tool}
                  className={annotationTool === tool ? "active" : ""}
                  aria-pressed={annotationTool === tool}
                  disabled={!numPages}
                  onClick={() => {
                    onSetAnnotationTool(annotationTool === tool ? null : tool);
                    annotateMenu.setOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
              <span className="dropdown-sep" />
              <button
                disabled={!hasUnsavedAnnotations}
                onClick={() => {
                  onSaveAnnotations();
                  annotateMenu.setOpen(false);
                }}
              >
                Save
              </button>
              <button
                disabled={!numPages}
                onClick={() => {
                  onChangeAnnotationMode();
                  annotateMenu.setOpen(false);
                }}
              >
                Change save location…
              </button>
            </div>
          )}
        </span>
        <span className="toolbar-divider" aria-hidden="true" />

        <button
          className={`night-reading-toggle${nightReading ? " active" : ""}`}
          aria-label={nightReading ? "Turn off night reading" : "Turn on night reading"}
          aria-pressed={nightReading}
          title="Night reading (invert page colors)"
          onClick={onToggleNightReading}
        >
          <IconMoon size={16} />
        </button>
        <span className="toolbar-divider" aria-hidden="true" />

        <span className={`search-wrap${mobileSearchOpen ? " open" : ""}`}>
          <button
            className="search-toggle"
            aria-label="Search"
            onClick={() => setMobileSearchOpen(true)}
          >
            <IconSearch size={16} />
          </button>
          <SearchBar eventBus={eventBus} />
          <button
            className="search-close"
            aria-label="Close search"
            onClick={() => setMobileSearchOpen(false)}
          >
            <IconX size={16} />
          </button>
        </span>
      </div>

      {onOpenSettings && (
        <>
          <span className="toolbar-divider" aria-hidden="true" />
          <button
            className="icon-btn settings-toggle"
            onClick={onOpenSettings}
            aria-label={settingsUpdateAvailable ? "Settings · update available" : "Settings"}
          >
            <IconSettings size={16} />
            {settingsUpdateAvailable && <span className="update-dot" />}
          </button>
        </>
      )}
    </div>
  );
}
