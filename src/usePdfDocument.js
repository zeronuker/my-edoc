import { useEffect, useRef, useState } from "react";
import { loadDocument } from "./edoc.js";
import { loadAnnotatedCopy } from "./annotations.js";
import { dbGet, dbSet } from "./db.js";
import { SCROLL_MODE_BY_VIEW, SPREAD_MODE_BY_VIEW } from "./PdfViewer.jsx";

// Owns the "what document is currently open, and how is it being viewed"
// concern: loading/switching/closing a file, the pdf.js viewer wiring for
// the loaded document, and per-file position memory. Deliberately takes
// isNarrow/viewerApi/closeSidebarIfAutoHide/addToRecent/setError as
// parameters rather than owning them — those belong to layout, the viewer
// widget's own lifecycle, the sidebar, recents, and the app-wide error
// banner respectively, none of which are specific to "which document is
// open" the way everything here is.
export function usePdfDocument({ isNarrow, viewerApi, closeSidebarIfAutoHide, addToRecent, setError }) {
  const [pdf, setPdf] = useState(null);
  const [selectedHandle, setSelectedHandle] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  // Two-page (or single-page on narrow screens) + fit-page is forced on
  // every file open (see selectFile/onPagesInit below) — this initial
  // value only matters before any file has been opened yet.
  const [viewMode, setViewMode] = useState("two-up");
  const [loading, setLoading] = useState(false);
  // Set when restoring the last-open file on launch finds the handle but
  // the read permission grant didn't survive (e.g. the OS killed and
  // reloaded the page in the background) — surfaces a one-tap "Reopen"
  // banner instead of silently landing on the empty file browser.
  const [pendingReopen, setPendingReopen] = useState(null);
  const [outline, setOutline] = useState(null);
  const [hasUnsavedAnnotations, setHasUnsavedAnnotations] = useState(false);

  const pendingRestoreRef = useRef(null);
  const restoringRef = useRef(false);
  // Bumped on every selectFile call; an in-flight call whose token no longer
  // matches has been superseded by a newer one (e.g. a fast double-click)
  // and must not apply its result — otherwise the older call's later-settling
  // load can overwrite state a newer, already-resolved call already set.
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
      all[selectedHandle.name] = { page: currentPage, scale, numPages };
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

  async function selectFile(fileHandle) {
    // Switching files abandons whatever's in the current document's
    // annotationStorage — confirm rather than silently losing drawn/typed
    // edits the user hasn't saved yet.
    if (hasUnsavedAnnotations) {
      const proceed = window.confirm(
        `You have unsaved annotations on "${selectedHandle?.name}". Switch files and discard them?`
      );
      if (!proceed) return;
    }
    const token = ++loadTokenRef.current;
    setSelectedHandle(fileHandle);
    setError(null);
    setPendingReopen(null);
    closeSidebarIfAutoHide();
    setLoading(true);
    // Two-page (or single-page on narrow screens) + fit-page is the
    // default on every open; manually switching view mode only sticks
    // for the file currently open.
    setViewMode(isNarrow ? "single" : "two-up");
    restoringRef.current = true;
    try {
      // A sidecar copy (see annotations.js) holds this file's saved
      // annotations when its mode is "sidecar" — load that instead of the
      // original so they carry across sessions; the original is only ever
      // touched in "writeback" mode.
      const file = (await loadAnnotatedCopy(fileHandle.name)) || (await fileHandle.getFile());
      let timeoutId;
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
      // A newer selectFile call has since taken over — drop this stale
      // result instead of overwriting the newer call's already-applied state.
      if (loadTokenRef.current !== token) return;
      const positions = (await dbGet("filePositions")) || {};
      pendingRestoreRef.current = positions[fileHandle.name] || null;
      setPdf(doc);
      if (!fileHandle.__legacy) await dbSet("lastFileHandle", fileHandle);
      addToRecent(fileHandle);
    } catch (err) {
      if (loadTokenRef.current !== token) return;
      console.error(err);
      setError(`Couldn't open "${fileHandle.name}": ${err.message}`);
      setPdf(null);
      restoringRef.current = false;
    } finally {
      if (loadTokenRef.current === token) setLoading(false);
    }
  }

  // Unconditional close — no unsaved-annotations confirm — for callers where
  // the document is being closed out from under the user (its folder/file
  // was just removed), not by their own choice.
  function clearDocument() {
    setPdf(null);
    setSelectedHandle(null);
    setError(null);
    setPendingReopen(null);
  }

  // Confirm-gated close for callers where the user is choosing to leave the
  // open document (typing in global search, "back to results"). Returns
  // whether the document was actually closed, so callers can bail out of
  // whatever else they were about to do (e.g. not update the search field).
  function closeDocument() {
    if (
      hasUnsavedAnnotations &&
      !window.confirm(`You have unsaved annotations on "${selectedHandle?.name}". Discard them?`)
    ) {
      return false;
    }
    clearDocument();
    return true;
  }

  // Button-click handler for the "Reopen [name]" banner — the click itself
  // is the user gesture requestPermission needs, unlike the silent
  // queryPermission check on launch.
  async function reopenLastFile() {
    const { fileHandle } = pendingReopen;
    if ((await fileHandle.requestPermission({ mode: "read" })) === "granted") {
      selectFile(fileHandle);
    } else {
      setPendingReopen(null);
    }
  }

  return {
    pdf,
    selectedHandle,
    numPages,
    currentPage,
    scale,
    viewMode,
    setViewMode,
    loading,
    pendingReopen,
    setPendingReopen,
    outline,
    hasUnsavedAnnotations,
    setHasUnsavedAnnotations,
    selectFile,
    closeDocument,
    clearDocument,
    reopenLastFile,
  };
}
