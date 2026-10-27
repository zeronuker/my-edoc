import { useEffect, useRef, useState } from "react";
import { loadDocument } from "./edoc.js";
import { loadAnnotatedCopy } from "./annotations.js";
import { extrasKey } from "./fileSystem.js";
import { dbGet, dbSet } from "./db.js";
import { SCROLL_MODE_BY_VIEW, SPREAD_MODE_BY_VIEW } from "./PdfViewer.jsx";
import { openTab } from "./appHelpers.js";

// One viewer's worth of document state: which tab it shows, the loaded PDF,
// page/zoom/view mode, outline, unsaved-annotations flag, and the pdf.js
// viewer wiring for it. Only the tab on show is ever loaded — the other tabs
// are just their file handles, reopened (at their remembered page) when
// picked. usePdfDocument runs one of these per pane and owns what they share
// (the tab list, which pane is active, closing tabs).
//
// Deliberately takes isNarrow/viewerApi/closeSidebarIfAutoHide/addToRecent/
// setError/confirmLeave as parameters rather than owning them — those belong
// to layout, the viewer widget's own lifecycle, the sidebar, recents, the
// app-wide error banner and the unsaved-annotations dialog respectively, none
// of which are specific to "which document is open" the way everything here
// is. confirmLeave(handle) resolves true once it's fine to drop that
// document's unsaved annotations. `split` is true while two panes share the
// screen: each then shows one page at a time (two-page view would decode up to
// four pages at once, which iPad Safari can't take with image-heavy scans).
export function usePane({
  isNarrow,
  split,
  viewerApi,
  tabs,
  setTabs,
  closeSidebarIfAutoHide,
  addToRecent,
  setError,
  confirmLeave,
}) {
  const [pdf, setPdf] = useState(null);
  const [activeKey, setActiveKey] = useState(null);
  const selectedHandle = tabs.find((t) => t.key === activeKey)?.handle ?? null;
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  // Two-page (or single-page on narrow screens) + fit-page is forced on
  // every file open (see loadFile/onPagesInit below) — this initial
  // value only matters before any file has been opened yet.
  const [chosenViewMode, setViewMode] = useState("two-up");
  const viewMode = split ? "single" : chosenViewMode;
  const [loading, setLoading] = useState(false);
  const [outline, setOutline] = useState(null);
  const [hasUnsavedAnnotations, setHasUnsavedAnnotations] = useState(false);

  const pendingRestoreRef = useRef(null);
  const restoringRef = useRef(false);
  // Bumped on every load; an in-flight call whose token no longer matches has
  // been superseded by a newer one (e.g. a fast double-click) and must not
  // apply its result — otherwise the older call's later-settling load can
  // overwrite state a newer, already-resolved call already set.
  const loadTokenRef = useRef(0);

  // Crossing the narrow breakpoint (e.g. rotating a phone) re-asserts the
  // width-based default live, the same way opening a file does.
  useEffect(() => {
    if (!pdf) return;
    setViewMode(isNarrow ? "single" : "two-up");
  }, [isNarrow, pdf]);

  // Per-file page/zoom memory, keyed by filename. restoringRef guards the
  // window between picking a new file and pdfjs firing pagesinit for it —
  // without it, this effect would fire with the previous file's still-current
  // page/scale and clobber the new file's saved position before restore runs.
  useEffect(() => {
    if (!selectedHandle || !pdf || restoringRef.current) return;
    (async () => {
      const all = (await dbGet("filePositions")) || {};
      all[extrasKey(selectedHandle)] = { page: currentPage, scale, numPages };
      await dbSet("filePositions", all);
    })();
  }, [selectedHandle, pdf, currentPage, scale, numPages]);

  // Drive the pdf.js viewer from React state/events instead of rendering
  // pages ourselves — see PdfViewer.jsx.
  useEffect(() => {
    if (!viewerApi) return;
    const { eventBus } = viewerApi;
    const onPageChanging = (e) => setCurrentPage(e.pageNumber);
    const onScaleChanging = (e) => setScale(e.scale);
    const onPagesInit = () => {
      // pdf.js resets scrollMode/spreadMode to its own defaults (continuous,
      // no spread) on every setDocument call, regardless of what they were
      // set to before — reassert ours here so a same-viewMode reopen (e.g.
      // two files on the same wide/narrow screen) doesn't silently fall back
      // to continuous. The effect below only catches *changes* to viewMode.
      viewerApi.pdfViewer.scrollMode = SCROLL_MODE_BY_VIEW[viewMode];
      viewerApi.pdfViewer.spreadMode = SPREAD_MODE_BY_VIEW[viewMode];
      // Fit-page always wins on open — per-file zoom memory below still
      // gets written, but isn't read back here. Page position is.
      viewerApi.pdfViewer.currentScaleValue = "page-fit";
      const pending = pendingRestoreRef.current;
      if (pending?.page) viewerApi.pdfViewer.currentPageNumber = pending.page;
      pendingRestoreRef.current = null;
      restoringRef.current = false;
      // pdf.js only fires pagechanging when its own page number changes, and
      // a new document starts at 1 whatever the last one was on — so a file
      // opened from page 2 of another would keep showing (and saving) "2".
      setCurrentPage(viewerApi.pdfViewer.currentPageNumber);
    };
    eventBus.on("pagechanging", onPageChanging);
    eventBus.on("scalechanging", onScaleChanging);
    eventBus.on("pagesinit", onPagesInit);
    return () => {
      eventBus.off("pagechanging", onPageChanging);
      eventBus.off("scalechanging", onScaleChanging);
      eventBus.off("pagesinit", onPagesInit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerApi, viewMode]);

  useEffect(() => {
    if (!viewerApi) return;
    if (!pdf) {
      setOutline(null);
      // Closing a doc (search typing, back-to-results, a failed open) has
      // to clear this the same way opening one does below — otherwise it's
      // stuck at whatever it was, and the next selectFile call's own
      // unsaved-annotations guard blocks silently on a stale true.
      setHasUnsavedAnnotations(false);
      setNumPages(0);
      return;
    }
    viewerApi.pdfViewer.setDocument(pdf);
    viewerApi.linkService.setDocument(pdf);
    setNumPages(pdf.numPages);
    pdf.getOutline().then((items) => setOutline(items?.length ? items : null));
    // Tracks whether there are annotation edits not yet baked into a save
    // (write-back or sidecar, see annotations.js) — drives the toolbar
    // Save button's enabled state.
    setHasUnsavedAnnotations(false);
    pdf.annotationStorage.onSetModified = () => setHasUnsavedAnnotations(true);
    pdf.annotationStorage.onResetModified = () => setHasUnsavedAnnotations(false);
    // Frees the worker-side heap (fonts, decoded bitmaps, render streams)
    // for this document the moment it's replaced by another or closed —
    // otherwise it leaks for as long as the tab stays open.
    return () => {
      pdf.destroy();
    };
  }, [viewerApi, pdf]);

  useEffect(() => {
    if (!viewerApi) return;
    viewerApi.pdfViewer.scrollMode = SCROLL_MODE_BY_VIEW[viewMode];
    viewerApi.pdfViewer.spreadMode = SPREAD_MODE_BY_VIEW[viewMode];
  }, [viewerApi, viewMode]);

  // Opens a file in this pane — its tab is added, or reused if it's open.
  async function selectFile(fileHandle) {
    // The tab already on screen: nothing to do (and nothing to confirm).
    if (extrasKey(fileHandle) === activeKey && (pdf || loading)) return;
    // Switching files abandons whatever's in the current document's
    // annotationStorage — confirm rather than silently losing drawn/typed
    // edits the user hasn't saved yet.
    if (hasUnsavedAnnotations && !(await confirmLeave(selectedHandle))) return;
    await loadFile(fileHandle);
  }

  async function loadFile(fileHandle) {
    const key = extrasKey(fileHandle);
    const token = ++loadTokenRef.current;
    setTabs((prev) => openTab(prev, fileHandle));
    setActiveKey(key);
    setError(null);
    closeSidebarIfAutoHide();
    setLoading(true);
    // Two-page (or single-page on narrow screens) + fit-page is the
    // default on every open; manually switching view mode only sticks
    // for the file currently open.
    setViewMode(isNarrow ? "single" : "two-up");
    restoringRef.current = true;
    let timeoutId;
    try {
      // A sidecar copy (see annotations.js) holds this file's saved
      // annotations when its mode is "sidecar" — load that instead of the
      // original so they carry across sessions; the original is only ever
      // touched in "writeback" mode.
      const file = (await loadAnnotatedCopy(extrasKey(fileHandle))) || (await fileHandle.getFile());
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Timed out loading PDF")), 15000);
      });
      // A password prompt blocks the JS thread for as long as the user takes
      // to answer it — cancel the load timeout the instant one appears, or
      // it'd fire the moment the thread frees up regardless of how long ago
      // the 15s actually elapsed.
      const doc = await Promise.race([
        loadDocument(file, { onPasswordPrompt: () => clearTimeout(timeoutId) }),
        timeout,
      ]);
      // A newer load has since taken over — drop this stale result instead of
      // overwriting the newer call's already-applied state.
      if (loadTokenRef.current !== token) return;
      const positions = (await dbGet("filePositions")) || {};
      pendingRestoreRef.current = positions[extrasKey(fileHandle)] || null;
      setPdf(doc);
      addToRecent(fileHandle);
    } catch (err) {
      if (loadTokenRef.current !== token) return;
      console.error(err);
      setError(`Couldn't open "${fileHandle.name}": ${err.message}`);
      // A file that won't open leaves no tab behind.
      setTabs((prev) => prev.filter((t) => t.key !== key));
      setActiveKey(null);
      setPdf(null);
      restoringRef.current = false;
    } finally {
      clearTimeout(timeoutId);
      if (loadTokenRef.current === token) setLoading(false);
    }
  }

  // Unloads the document and cancels any load still in flight. Its tab, if
  // there is one, stays in the bar.
  function unloadDocument() {
    loadTokenRef.current++;
    restoringRef.current = false;
    setActiveKey(null);
    setPdf(null);
    setLoading(false);
    setError(null);
  }

  // Confirm-gated "step away from the open document" for callers where the
  // user is choosing to leave it (typing in global search, "back to
  // results"): the viewer empties but the tab stays. Resolves to whether it
  // happened, so callers can bail out of whatever else they were about to do
  // (e.g. not update the search field).
  async function closeDocument() {
    if (hasUnsavedAnnotations && !(await confirmLeave(selectedHandle))) return false;
    unloadDocument();
    return true;
  }

  return {
    pdf,
    activeKey,
    selectedHandle,
    numPages,
    currentPage,
    scale,
    viewMode,
    setViewMode,
    loading,
    outline,
    hasUnsavedAnnotations,
    setHasUnsavedAnnotations,
    selectFile,
    loadFile,
    unloadDocument,
    closeDocument,
  };
}
